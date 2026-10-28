import { ApplicationError, invalidInput } from "../../../../core/applicationError";
import { type Orm, ormOf } from "../../../../core/db";
import { readOwner } from "../../../../core/instance";
import { appendRecordHistory, type HistoryLine, parseChangeReason } from "../../../../core/records";
import {
  BASE_PROFILE,
  type ExtraProfile,
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
 * Replaces the extra profiles of the user an employee signs in as and records the change in the
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
  const extras = parseExtras(profiles);
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
    const replaced = await permissionProfileRepository(tx).replaceExtras(employee.userId, extras);
    const before = profilesOf(replaced, false).join(", ");
    const after = profilesOf(extras, false).join(", ");
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
      { employeeId, historyId: historyLine.id, permissionProfiles: extras },
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
  const extras = await permissionProfileRepository(orm).findExtras(
    linked.map(({ userId }) => userId),
  );
  const ownerUserId = (await readOwner(orm))?.userId;
  return new Map(
    linked.map(({ id, userId }) => [
      id,
      profilesOf(extras.get(userId) ?? [], userId === ownerUserId),
    ]),
  );
}

/** The assignable profiles among `profiles`, each once; `EMPLOYEE` is always on and left out. */
function parseExtras(profiles: readonly PermissionProfile[]): ExtraProfile[] {
  if (profiles.includes("OWNER")) {
    throw invalidInput([{ field: "profiles", code: "not_assignable" }]);
  }
  return [...new Set(profiles.filter((profile) => profile !== BASE_PROFILE))] as ExtraProfile[];
}
