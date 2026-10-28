import { ApplicationError, invalidInput } from "../../../../core/applicationError";
import { type Orm, ormOf } from "../../../../core/db";
import { readOwner } from "../../../../core/instance";
import { appendRecordHistory, type HistoryLine, parseChangeReason } from "../../../../core/records";
import {
  parseGivenProfiles,
  permissionProfileRepository,
  type PermissionProfile,
  profilesOf,
  type SecurityContext,
} from "../../../../core/security";
import { parseUuid } from "../../../../utils";
import { employeeRepository } from "../../db";
import type { Employee } from "../../domain";
import type { EmployeeContext } from "./employeeContext";
import { employeeNotFound } from "./employeeNotFound";

/**
 * Replaces the profiles given to the user an employee signs in as and records the change in the
 * employee's history, in one transaction; returns the line, or null when the set was unchanged.
 */
export async function setPermissionProfiles(
  { transact, logger }: EmployeeContext,
  ctx: SecurityContext,
  {
    id,
    profiles,
    changeReason,
  }: { id: string; profiles: readonly PermissionProfile[]; changeReason?: string | null },
): Promise<{ employee: Employee; historyLine: HistoryLine | null }> {
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
    if (employee.userId === (await readOwner(ormOf(tx)))?.userId) {
      throw new ApplicationError("FORBIDDEN", "The owner's permissions cannot change.");
    }
    // The set it replaces, not one read before, so two saves at once record one change.
    const replaced = await permissionProfileRepository(tx).replaceProfiles(employee.userId, given);
    const before = profilesOf(replaced, false).join(", ");
    const after = profilesOf(given, false).join(", ");
    if (before === after) {
      return { employee, historyLine: null };
    }
    const [line] = await appendRecordHistory(ctx, tx, {
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
  return { employee, historyLine };
}

/**
 * The profiles of the user each employee signs in as, `EMPLOYEE` first and `OWNER` for the
 * owner's. Employees without a user are left out.
 */
export async function readPermissionProfiles(
  orm: Orm,
  ctx: SecurityContext,
  employeeIds: readonly string[],
): Promise<Map<string, PermissionProfile[]>> {
  ctx.requireEveryRecord("employee", "read");
  const ids = employeeIds.flatMap((id) => parseUuid(id) ?? []);
  const linked = (ids.length === 0 ? [] : await employeeRepository(orm).findByIds(ids)).flatMap(
    ({ id, userId }) => (userId ? [{ id, userId }] : []),
  );
  if (linked.length === 0) return new Map();
  const stored = await permissionProfileRepository(orm).findProfiles(
    linked.map(({ userId }) => userId),
  );
  const ownerUserId = (await readOwner(orm))?.userId;
  return new Map(
    linked.map(({ id, userId }) => [
      id,
      profilesOf(stored.get(userId) ?? [], userId === ownerUserId),
    ]),
  );
}
