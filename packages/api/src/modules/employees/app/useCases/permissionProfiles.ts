import { ApplicationError, invalidInput } from "../../../../core/applicationError";
import { type Orm, ormOf } from "../../../../core/db";
import { readOwner } from "../../../../core/instance";
import { appendRecordHistory, type HistoryLine, parseChangeReason } from "../../../../core/records";
import type { PermissionProfile, SecurityContext } from "../../../../core/security";
import { parseUuid } from "../../../../utils";
import { employeeRepository } from "../../db";
import type { Employee } from "../../domain";
import type { EmployeeContext } from "./employeeContext";
import { employeeNotFound } from "./employeeNotFound";

/**
 * Sets the profile of the user an employee signs in as and records the change in the employee's
 * history, in one transaction; returns the line, or null when the profile was already set.
 */
export async function setPermissionProfile(
  { transact, logger }: EmployeeContext,
  ctx: SecurityContext,
  {
    id,
    profile,
    changeReason,
  }: { id: string; profile: PermissionProfile; changeReason?: string | null },
): Promise<{ employee: Employee; historyLine: HistoryLine | null }> {
  ctx.require("MANAGE_WORKSPACE");
  if (profile === "OWNER") {
    throw invalidInput([{ field: "profile", code: "not_assignable" }]);
  }
  const reason = parseChangeReason(changeReason);
  const employeeId = parseUuid(id);
  if (!employeeId) {
    throw employeeNotFound();
  }
  const { employee, historyLine } = await transact(async (tx) => {
    const employees = employeeRepository(tx);
    const employee = await employees.findById(employeeId);
    if (!employee) {
      throw employeeNotFound();
    }
    const [linked] = await employees.findUserProfiles([employeeId]);
    if (!linked) {
      throw invalidInput([{ field: "id", code: "not_joined" }]);
    }
    if (linked.userId === (await readOwner(ormOf(tx)))?.userId) {
      throw new ApplicationError("FORBIDDEN", "The owner's permissions cannot change.");
    }
    const before = linked.permissionProfile ?? "EMPLOYEE";
    if (before === profile) {
      return { employee, historyLine: null };
    }
    await employees.setUserProfile(linked.userId, profile === "ADMIN" ? "ADMIN" : null);
    const [line] = await appendRecordHistory(ctx, tx, {
      recordType: "employee",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      reason,
      records: [
        {
          recordId: employeeId,
          changes: [{ field: "permissionProfile", oldValue: before, newValue: profile }],
        },
      ],
    });
    return { employee, historyLine: line! };
  });
  if (historyLine) {
    logger.info(
      { employeeId, historyId: historyLine.id, permissionProfile: profile },
      "Changed an employee's permission profile",
    );
  }
  return { employee, historyLine };
}

/**
 * The profile of the user each employee signs in as: `OWNER` for the owner's, `EMPLOYEE` when none
 * is stored. Employees without a user are left out.
 */
export async function readPermissionProfiles(
  orm: Orm,
  ctx: SecurityContext,
  employeeIds: readonly string[],
): Promise<Map<string, PermissionProfile>> {
  ctx.requireEveryRecord("employee", "read");
  const ids = employeeIds.flatMap((id) => parseUuid(id) ?? []);
  const linked = ids.length === 0 ? [] : await employeeRepository(orm).findUserProfiles(ids);
  const ownerUserId = linked.length === 0 ? null : (await readOwner(orm))?.userId;
  return new Map(
    linked.map(({ employeeId, userId, permissionProfile }) => [
      employeeId,
      userId === ownerUserId ? "OWNER" : (permissionProfile ?? "EMPLOYEE"),
    ]),
  );
}
