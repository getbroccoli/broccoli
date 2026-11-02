import { eq, inArray } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { GroupMembership } from "../domain";
import { employeePolicyGroups } from "./employeePolicyGroupsTable";
import { policyGroups } from "./policyGroupsTable";

/** Policy groups and who is in them, through the pool or inside a transaction. */
export interface PolicyGroupRepository {
  /** Puts new employees into the seeded "Everyone" group since their employment started. */
  joinEveryoneGroup(employeeIds: readonly string[]): Promise<void>;
  /** The id of the seeded "Everyone" group. */
  findEveryoneId(): Promise<string>;
  /** Whether a group has this id. */
  exists(groupId: string): Promise<boolean>;
  /** Each employee's groups over time, by employee id. */
  findMemberships(employeeIds: readonly string[]): Promise<Map<string, GroupMembership[]>>;
  /** The employees in the group on any date. */
  findMemberIds(groupId: string): Promise<string[]>;
}

export function policyGroupRepository(db: Orm | Tx): PolicyGroupRepository {
  const orm = () => ormOf(db);
  return {
    async joinEveryoneGroup(employeeIds) {
      if (employeeIds.length === 0) {
        return;
      }
      const everyoneId = await findEveryoneId(orm());
      await orm()
        .insert(employeePolicyGroups)
        .values(employeeIds.map((employeeId) => ({ employeeId, policyGroupId: everyoneId })));
    },

    findEveryoneId: () => findEveryoneId(orm()),

    async exists(groupId) {
      const [group] = await orm()
        .select({ id: policyGroups.id })
        .from(policyGroups)
        .where(eq(policyGroups.id, groupId));
      return group !== undefined;
    },

    async findMemberships(employeeIds) {
      const rows = await orm()
        .select()
        .from(employeePolicyGroups)
        .where(inArray(employeePolicyGroups.employeeId, [...employeeIds]));
      const memberships = new Map<string, GroupMembership[]>();
      for (const { employeeId, policyGroupId, effectiveFrom, effectiveUntil } of rows) {
        const membership = { policyGroupId, effectiveFrom, effectiveUntil };
        memberships.set(employeeId, [...(memberships.get(employeeId) ?? []), membership]);
      }
      return memberships;
    },

    async findMemberIds(groupId) {
      const rows = await orm()
        .selectDistinct({ employeeId: employeePolicyGroups.employeeId })
        .from(employeePolicyGroups)
        .where(eq(employeePolicyGroups.policyGroupId, groupId));
      return rows.map(({ employeeId }) => employeeId);
    },
  };
}

async function findEveryoneId(orm: ReturnType<typeof ormOf>): Promise<string> {
  const [everyone] = await orm
    .select({ id: policyGroups.id })
    .from(policyGroups)
    .where(eq(policyGroups.key, "everyone"));
  return everyone!.id;
}
