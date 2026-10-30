import { invalidInput } from "../../../../core/applicationError";
import type { Tx } from "../../../../core/db";
import { appendRecordHistory, type FieldChange, type HistoryLine } from "../../../../core/records";
import type { SecurityContext } from "../../../../core/security";
import { type CalendarDate, parseUuid, todayInUtc } from "../../../../utils";
import { type EmployeeRepository, employeeRepository, employmentRepository } from "../../db";
import {
  EmailTakenError,
  type Employee,
  employeeChanges,
  type EmployeeUpdateInput,
  managerChanges,
  type NewEmployee,
  parseEmployeeUpdate,
} from "../../domain";
import type { EmployeeContext } from "./employeeContext";
import { employeeNotFound } from "./employeeNotFound";
import { readableResult } from "./readableResult";

/**
 * Changes the fields an update sends and records the change in the employee's history, in one
 * transaction, and returns the line. A save that changes nothing records nothing; the last save
 * of a field wins.
 */
export async function updateEmployee(
  { transact, logger }: EmployeeContext,
  ctx: SecurityContext,
  { id, ...input }: EmployeeUpdateInput & { id: string },
): Promise<{ employee: Employee | null; historyLine: HistoryLine | null }> {
  const employeeId = parseUuid(id);
  if (!employeeId) {
    ctx.requireEveryRecord("employee", "update");
    throw employeeNotFound();
  }
  await ctx.requireWrite("employee", employeeId, fieldsSent(input));
  const { changes, managerId, reason } = parseEmployeeUpdate(input);
  const { employee, historyLine } = await transact(async (tx) => {
    if (managerId !== undefined) {
      // Before the employee row, in the order a deletion takes them, so the two cannot deadlock.
      await employmentRepository(tx).lockManagers();
    }
    const { startDate, ...fields } = changes;
    const { before, after } = await saveChanges(employeeRepository(tx), employeeId, fields);
    const changed = [
      ...employeeChanges(before, after),
      ...(startDate === undefined ? [] : await changeStartDate(tx, employeeId, startDate)),
      ...(managerId === undefined ? [] : await changeManager(tx, employeeId, managerId)),
    ];
    if (changed.length === 0) {
      return { employee: after, historyLine: null };
    }
    const [line] = await appendRecordHistory(ctx, tx, {
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
}

/** Moves the employee's start date and returns the history change. */
async function changeStartDate(
  tx: Tx,
  employeeId: string,
  startDate: CalendarDate | null,
): Promise<FieldChange[]> {
  const employments = employmentRepository(tx);
  // In the order an update takes them, so the read sees a start date committed while it waited.
  await employments.lockForWrites();
  await employeeRepository(tx).lockByIds([employeeId]);
  const before = (await employments.findStartDates([employeeId])).get(employeeId) ?? null;
  if (before !== startDate) {
    await employments.setStartDate(employeeId, startDate);
  }
  return employeeChanges({ startDate: before }, { startDate });
}

/**
 * Makes `managerId` the employee's manager from today and returns the history change; refuses an
 * unknown manager, the employee themselves, or one who already reports to them. Needs
 * `lockManagers` held.
 */
async function changeManager(
  tx: Tx,
  employeeId: string,
  managerId: string | null,
): Promise<FieldChange[]> {
  const employments = employmentRepository(tx);
  const today = todayInUtc();
  const managerIds = await employments.findManagerIds([employeeId], today);
  const before = await findEmployee(tx, managerIds.get(employeeId));
  const after =
    managerId === null ? null : await findAllowedManager(tx, employeeId, managerId, today);
  if (before?.id !== after?.id) {
    await employments.setManager(employeeId, after?.id ?? null, today);
  }
  return managerChanges(before, after);
}

async function findAllowedManager(
  tx: Tx,
  employeeId: string,
  managerId: string,
  today: CalendarDate,
): Promise<Employee> {
  const manager = await findEmployee(tx, parseUuid(managerId));
  if (!manager) {
    throw invalidInput([{ field: "managerId", code: "not_found" }]);
  }
  if (manager.id === employeeId) {
    throw invalidInput([{ field: "managerId", code: "self" }]);
  }
  const managersAbove = await employmentRepository(tx).findManagersAbove([manager.id], today);
  if (managersAbove.get(manager.id)?.includes(employeeId)) {
    throw invalidInput([{ field: "managerId", code: "loop" }]);
  }
  return manager;
}

async function findEmployee(tx: Tx, id: string | null | undefined): Promise<Employee | null> {
  return id ? employeeRepository(tx).findById(id) : null;
}

/** The employee before and after saving `changes`; refuses an unknown employee or a taken email. */
async function saveChanges(
  employees: EmployeeRepository,
  employeeId: string,
  changes: Partial<Omit<NewEmployee, "startDate">>,
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
