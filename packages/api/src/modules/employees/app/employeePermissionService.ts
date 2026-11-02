import { ApplicationError, invalidInput } from "../../../core/applicationError";
import { ormOf } from "../../../core/db";
import { createOwnerService } from "../../../core/instance";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import {
  createRecordHistoryService,
  type HistoryLine,
  parseChangeReason,
} from "../../../core/records";
import {
  isInRecordScope,
  parseGivenProfiles,
  permissionProfileRepository,
  type PermissionProfile,
  profilesOf,
  type SecurityContext,
} from "../../../core/security";
import { parseUuid } from "../../../utils";
import { employeeRepository } from "../db";
import type { Employee } from "../domain";
import { employeeNotFound } from "./employeeNotFound";
import { readableResult } from "./readableResult";

const owners = createOwnerService();
const recordHistory = createRecordHistoryService();

/** The permission profiles of the user each employee signs in as. */
export interface EmployeePermissionService {
  /**
   * Replaces the profiles given to the user an employee signs in as and records the change in the
   * employee's history, in one transaction; the line is null when the set was unchanged. Refuses an
   * unknown id with NOT_FOUND, an employee without a user, and the owner. The employee and line are
   * null when the caller may not read the employee.
   */
  setPermissionProfiles: (
    ctx: SecurityContext,
    input: { id: string; profiles: readonly PermissionProfile[]; changeReason?: string | null },
  ) => Promise<{ employee: Employee | null; historyLine: HistoryLine | null }>;
  /**
   * The profiles of the user each employee signs in as, by employee id, `EMPLOYEE` first and
   * `OWNER` for the owner's. Employees without a user, or whom the caller may not read, are left out.
   */
  readPermissionProfiles: (
    ctx: SecurityContext,
    employeeIds: readonly string[],
  ) => Promise<Map<string, PermissionProfile[]>>;
}

export function createEmployeePermissionService({
  orm,
  transact,
  logger,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger">): EmployeePermissionService {
  return {
    async setPermissionProfiles(ctx, { id, profiles, changeReason }) {
      ctx.require("MANAGE_WORKSPACE");
      const given = parseGivenProfiles(profiles);
      const reason = parseChangeReason(changeReason);
      const employeeId = parseUuid(id);
      if (!employeeId) {
        throw employeeNotFound();
      }
      const { employee, historyLine } = await transact(async (tx) => {
        const employee = await employeeRepository(tx).findById(employeeId);
        if (!employee) {
          throw employeeNotFound();
        }
        if (!employee.userId) {
          throw invalidInput([{ field: "id", code: "not_joined" }]);
        }
        if (employee.userId === (await owners.readOwner(ormOf(tx)))?.userId) {
          throw new ApplicationError("FORBIDDEN", "The owner's permissions cannot change.");
        }
        // The set it replaces, not one read before, so two saves at once record one change.
        const replaced = await permissionProfileRepository(tx).replaceProfiles(
          employee.userId,
          given,
        );
        const before = profilesOf(replaced, false).join(", ");
        const after = profilesOf(given, false).join(", ");
        if (before === after) {
          return { employee, historyLine: null };
        }
        const [line] = await recordHistory.append(ctx, tx, {
          recordType: "employee",
          operation: "UPDATED",
          cause: { kind: "EDITED_DIRECTLY" },
          reason,
          records: [
            {
              recordId: employeeId,
              changes: [{ field: "permissionProfiles", oldValue: before, newValue: after }],
            },
          ],
        });
        return { employee, historyLine: line! };
      });
      if (historyLine) {
        logger.info(
          { employeeId, historyId: historyLine.id, permissionProfiles: given },
          "Changed an employee's permission profiles",
        );
      }
      return readableResult(ctx, employee, historyLine);
    },
    async readPermissionProfiles(ctx, employeeIds) {
      const scope = await ctx.recordScope("employee", "read");
      const ids = employeeIds.flatMap((id) => {
        const employeeId = parseUuid(id);
        return employeeId && isInRecordScope(scope, employeeId) ? [employeeId] : [];
      });
      const linked = (ids.length === 0 ? [] : await employeeRepository(orm).findByIds(ids)).flatMap(
        ({ id, userId }) => (userId ? [{ id, userId }] : []),
      );
      if (linked.length === 0) return new Map();
      const stored = await permissionProfileRepository(orm).findProfiles(
        linked.map(({ userId }) => userId),
      );
      const ownerUserId = (await owners.readOwner(orm))?.userId;
      return new Map(
        linked.map(({ id, userId }) => [
          id,
          profilesOf(stored.get(userId) ?? [], userId === ownerUserId),
        ]),
      );
    },
  };
}
