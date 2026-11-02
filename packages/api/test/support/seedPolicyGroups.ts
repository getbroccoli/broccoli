import { eq } from "drizzle-orm";

import type { Orm } from "../../src/core/db";
import { employeePolicyGroups, policyGroups } from "../../src/modules/employees/db";
import { parseCalendarDate } from "../../src/utils";

export async function everyoneGroupId(orm: Orm): Promise<string> {
  const [everyone] = await orm
    .select({ id: policyGroups.id })
    .from(policyGroups)
    .where(eq(policyGroups.key, "everyone"));
  return everyone!.id;
}

export async function insertPolicyGroup(orm: Orm, name: string): Promise<string> {
  const [group] = await orm
    .insert(policyGroups)
    .values({ name })
    .returning({ id: policyGroups.id });
  return group!.id;
}

export async function leaveGroups(orm: Orm, employeeId: string): Promise<void> {
  await orm.delete(employeePolicyGroups).where(eq(employeePolicyGroups.employeeId, employeeId));
}

export async function moveToGroup(
  orm: Orm,
  {
    employeeId,
    policyGroupId,
    from,
  }: { employeeId: string; policyGroupId: string; from: string | null },
): Promise<void> {
  await leaveGroups(orm, employeeId);
  await orm.insert(employeePolicyGroups).values({
    employeeId,
    policyGroupId,
    effectiveFrom: from === null ? null : parseCalendarDate(from)!,
  });
}
