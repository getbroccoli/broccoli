import { eq } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import { employeePolicyGroups } from "./employeePolicyGroupsTable";
import { policyGroups } from "./policyGroupsTable";

/** Policy groups and who is in them, through the pool or inside a transaction. */
export interface PolicyGroupRepository {
  /** Puts new employees into the seeded "Everyone" group since their employment started. */
  joinEveryone(employeeIds: readonly string[]): Promise<void>;
}

export function policyGroupRepository(db: Orm | Tx): PolicyGroupRepository {
  const orm = () => ormOf(db);
  return {
    async joinEveryone(employeeIds) {
      if (employeeIds.length === 0) {
        return;
      }
      const [everyone] = await orm()
        .select({ id: policyGroups.id })
        .from(policyGroups)
        .where(eq(policyGroups.key, "everyone"));
      await orm()
        .insert(employeePolicyGroups)
        .values(employeeIds.map((employeeId) => ({ employeeId, policyGroupId: everyone!.id })));
    },
  };
}
