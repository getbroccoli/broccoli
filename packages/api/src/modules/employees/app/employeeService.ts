import { invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import {
  createRecordHistoryService,
  type FieldChange,
  type HistoryLine,
  parseChangeReason,
} from "../../../core/records";
import { isInRecordScope, type SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid, todayInUtc } from "../../../utils";
import {
  type EmployeeRepository,
  employeeRepository,
  employmentRepository,
  locationRepository,
} from "../db";
import {
  EmailTakenError,
  type Employee,
  employeeChanges,
  type EmployeeUpdateInput,
  type Location,
  locationChanges,
  managerChanges,
  type NewEmployee,
  type NewEmployeeInput,
  parseEmployeeUpdate,
  parseNewEmployee,
} from "../domain";
import { changeManagers } from "./employeeManagerService";
import { employeeNotFound } from "./employeeNotFound";
import { readableResult } from "./readableResult";
import { recordCreatedEmployees } from "./recordCreatedEmployees";

const recordHistory = createRecordHistoryService();

/** Adds, changes and removes employees, each in one transaction with its history lines. */
export interface EmployeeService {
  /** Adds an employee; returns null when the caller may not read them. */
  createEmployee: (ctx: SecurityContext, input: NewEmployeeInput) => Promise<Employee | null>;
  /**
   * Changes the fields an update sends and records the change in the employee's history, and
   * returns the line. A save that changes nothing records nothing; the last save of a field wins.
   * Refuses an unknown id with NOT_FOUND. The employee and line are null when the caller may not
   * read the employee.
   */
  updateEmployee: (
    ctx: SecurityContext,
    input: EmployeeUpdateInput & { id: string },
  ) => Promise<{ employee: Employee | null; historyLine: HistoryLine | null }>;
  /**
   * Removes an employee and their avatar and records what they held, their manager too, as a
   * deletion line; their history stays. Their reports are left without a manager, with a line
   * each, which it returns, those of reports the caller may read, with the deleted employee's id.
   * Refuses an unknown id with NOT_FOUND.
   */
  deleteEmployee: (
    ctx: SecurityContext,
    input: { id: string; changeReason?: string | null },
  ) => Promise<{ deletedEmployeeId: string; reportHistoryLines: HistoryLine[] }>;
}

export function createEmployeeService({
  transact,
  logger,
}: Pick<ModuleDependencies, "transact" | "logger">): EmployeeService {
  return {
    async createEmployee(ctx, input) {
      ctx.requireEveryRecord("employee", "create");
      const newEmployee = parseNewEmployee(input);
      try {
        const employee = await transact(async (tx) => {
          const employee = await employeeRepository(tx).insert(newEmployee);
          await recordCreatedEmployees(ctx, tx, [employee], { kind: "EDITED_DIRECTLY" });
          return employee;
        });
        return (await readableResult(ctx, employee, null)).employee;
      } catch (error) {
        if (error instanceof EmailTakenError) {
          throw invalidInput([{ field: "email", code: "taken" }]);
        }
        throw error;
      }
    },
    async updateEmployee(ctx, { id, ...input }) {
      const employeeId = parseUuid(id);
      if (!employeeId) {
        ctx.requireEveryRecord("employee", "update");
        throw employeeNotFound();
      }
      await ctx.requireWrite("employee", [employeeId], fieldsSent(input));
      const { changes, managerId, locationId, reason } = parseEmployeeUpdate(input);
      const { employee, historyLine } = await transact(async (tx) => {
        if (managerId !== undefined || locationId !== undefined) {
          // Before the employee row and the location, in the order a deletion or reset takes them, so they cannot deadlock.
          await employmentRepository(tx).lockForWrites();
        }
        const { startDate, ...fields } = changes;
        const location = locationId === undefined ? undefined : await holdLocation(tx, locationId);
        const { before, after } = await saveChanges(employeeRepository(tx), employeeId, {
          ...fields,
          ...(location !== undefined && { locationId: location?.id ?? null }),
        });
        const startDateChanges =
          startDate === undefined ? [] : await changeStartDate(tx, employeeId, startDate);
        const changed = [
          ...employeeChanges(before, after),
          ...(location === undefined ? [] : await movedLocation(tx, before.locationId, location)),
          ...startDateChanges,
          ...(managerId === undefined
            ? []
            : (await changeManagers(tx, [employeeId], managerId)).get(employeeId)!),
        ];
        if (changed.length === 0) {
          return { employee: after, historyLine: null };
        }
        const [line] = await recordHistory.append(ctx, tx, {
          recordType: "employee",
          operation: "UPDATED",
          cause: { kind: "EDITED_DIRECTLY" },
          reason,
          records: [{ recordId: employeeId, changes: changed }],
        });
        return { employee: after, historyLine: line! };
      });
      if (historyLine) {
        logger.info(
          { employeeId, historyId: historyLine.id, fields: fieldsOf(historyLine) },
          "Updated an employee",
        );
      }
      return readableResult(ctx, employee, historyLine);
    },
    async deleteEmployee(ctx, { id, changeReason }) {
      const reason = parseChangeReason(changeReason);
      const employeeId = parseUuid(id);
      if (!employeeId) {
        ctx.requireEveryRecord("employee", "delete");
        throw employeeNotFound();
      }
      await ctx.requireInScope("employee", "delete", employeeId);
      const { historyId, reportHistoryLines } = await transact(async (tx) => {
        const employments = employmentRepository(tx);
        // First, as a manager change takes it, so the manager read below is the one being removed.
        await employments.lockForWrites();
        const manager = await findManagerOf(tx, employeeId);
        const startDate = (await employments.findStartDates([employeeId])).get(employeeId) ?? null;
        // Before the delete: its foreign key would clear them too, but without saying whose.
        const reportIds = await employments.clearManager(employeeId);
        const deleted = await employeeRepository(tx).delete(employeeId);
        if (!deleted) {
          throw employeeNotFound();
        }
        const [line] = await recordHistory.append(ctx, tx, {
          recordType: "employee",
          operation: "DELETED",
          cause: { kind: "EDITED_DIRECTLY" },
          reason,
          records: [
            {
              recordId: employeeId,
              changes: [
                ...employeeChanges({ ...deleted, startDate }, null),
                ...(await movedLocation(tx, deleted.locationId, null)),
                ...managerChanges(manager, null),
              ],
            },
          ],
        });
        return {
          historyId: line!.id,
          reportHistoryLines: await updateReportHistory(ctx, tx, deleted, reportIds),
        };
      });
      logger.info({ employeeId, historyId }, "Deleted an employee");
      if (reportHistoryLines.length > 0) {
        const reportCount = reportHistoryLines.length;
        logger.info({ employeeId, reportCount }, "Cleared the manager of reports");
      }
      const scope = await ctx.recordScope("employee", "read");
      return {
        deletedEmployeeId: employeeId,
        reportHistoryLines: reportHistoryLines.filter(({ recordId }) =>
          isInRecordScope(scope, recordId),
        ),
      };
    },
  };
}

/** Moves the employee's start date and returns the history change; refuses an employee deleted meanwhile. */
async function changeStartDate(
  tx: Tx,
  employeeId: string,
  startDate: CalendarDate | null,
): Promise<FieldChange[]> {
  const employments = employmentRepository(tx);
  // In the order an update takes them, so the read sees a start date committed while it waited.
  await employments.lockForWrites();
  await employeeRepository(tx).lockByIds([employeeId]);
  const startDates = await employments.findStartDates([employeeId]);
  if (!startDates.has(employeeId)) {
    throw employeeNotFound();
  }
  const before = startDates.get(employeeId)!;
  if (before !== startDate) {
    await employments.setStartDate(employeeId, startDate);
    tx.publish("employees.start_date_changed", {
      employeeId,
      startDate,
      previousStartDate: before,
    });
  }
  return employeeChanges({ startDate: before }, { startDate });
}

/** The location an update moves the person to, held until commit; refuses an id that names none. */
async function holdLocation(tx: Tx, locationId: string | null): Promise<Location | null> {
  if (locationId === null) {
    return null;
  }
  const id = parseUuid(locationId);
  const location = id ? await locationRepository(tx).findAndHold(id) : null;
  if (!location) {
    throw invalidInput([{ field: "locationId", code: "not_found" }]);
  }
  return location;
}

/** The history change of moving from the location `beforeId` to `after`. */
async function movedLocation(
  tx: Tx,
  beforeId: string | null,
  after: Location | null,
): Promise<FieldChange[]> {
  const [before] = beforeId ? await locationRepository(tx).findByIds([beforeId]) : [];
  return locationChanges(before ?? null, after);
}

/** The employee before and after saving `changes`; refuses an unknown employee or a taken email. */
async function saveChanges(
  employees: EmployeeRepository,
  employeeId: string,
  changes: Partial<Omit<NewEmployee, "startDate"> & Pick<Employee, "locationId">>,
): Promise<{ before: Employee; after: Employee }> {
  if (Object.keys(changes).length === 0) {
    const employee = await employees.findById(employeeId);
    if (!employee) {
      throw employeeNotFound();
    }
    return { before: employee, after: employee };
  }
  try {
    const saved = await employees.update(employeeId, changes);
    if (!saved) {
      throw employeeNotFound();
    }
    return saved;
  } catch (error) {
    if (error instanceof EmailTakenError) {
      throw invalidInput([{ field: "email", code: "taken" }]);
    }
    throw error;
  }
}

/** The fields an update sends, by their input names; the reason is not a field. */
function fieldsSent(input: EmployeeUpdateInput): string[] {
  return Object.entries(input)
    .filter(([field, value]) => field !== "changeReason" && value !== undefined)
    .map(([field]) => field);
}

function fieldsOf(line: HistoryLine): string[] {
  return line.changes.map(({ field }) => field);
}

async function findManagerOf(tx: Tx, employeeId: string): Promise<Employee | null> {
  const managerIds = await employmentRepository(tx).findManagerIds([employeeId], todayInUtc());
  const managerId = managerIds.get(employeeId);
  return managerId ? employeeRepository(tx).findById(managerId) : null;
}

/**
 * The removed person's reports are left without a manager. Writes a "manager removed" line on
 * each report's own history, so the change shows there, and returns the lines for their open panels.
 */
async function updateReportHistory(
  ctx: SecurityContext,
  tx: Tx,
  manager: Employee,
  reportIds: readonly string[],
): Promise<HistoryLine[]> {
  if (reportIds.length === 0) {
    return [];
  }
  return recordHistory.append(ctx, tx, {
    recordType: "employee",
    operation: "UPDATED",
    // The removed manager is in each line's `manager` change; a ref would only repeat them.
    cause: { kind: "MANAGER_REMOVED" },
    records: reportIds.map((recordId) => ({ recordId, changes: managerChanges(manager, null) })),
  });
}
