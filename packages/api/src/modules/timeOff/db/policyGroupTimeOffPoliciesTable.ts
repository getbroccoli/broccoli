import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, pgTable, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { timeOffPolicies } from "./timeOffPoliciesTable";
import { timeOffTypes } from "./timeOffTypesTable";

/**
 * Which policy a group's members get for one type by default, and when. A group's rows for one
 * type never overlap; the migration adds that exclusion constraint and the foreign key to
 * `policy_groups`, which the employees module owns.
 */
export const policyGroupTimeOffPolicies = pgTable(
  "policy_group_time_off_policies",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    policyGroupId: uuid("policy_group_id").notNull(),
    timeOffTypeId: uuid("time_off_type_id").notNull(),
    timeOffPolicyId: uuid("time_off_policy_id").notNull(),
    /** Null: from the beginning. */
    effectiveFrom: date("effective_from", { mode: "string" }).$type<CalendarDate>(),
    /** The last day the row applies; null: open-ended. */
    effectiveUntil: date("effective_until", { mode: "string" }).$type<CalendarDate>(),
  },
  (table) => [
    // Named here: the generated name would pass Postgres's 63-character limit.
    foreignKey({
      name: "policy_group_time_off_policies_type_fk",
      columns: [table.timeOffTypeId],
      foreignColumns: [timeOffTypes.id],
    }),
    // Keeps the policy on the row's own type.
    foreignKey({
      name: "policy_group_time_off_policies_policy_of_type_fk",
      columns: [table.timeOffPolicyId, table.timeOffTypeId],
      foreignColumns: [timeOffPolicies.id, timeOffPolicies.timeOffTypeId],
    }),
    index("policy_group_time_off_policies_policy_idx").on(table.timeOffPolicyId),
    check(
      "policy_group_time_off_policies_dates_in_order",
      sql`${table.effectiveUntil} >= ${table.effectiveFrom}`,
    ),
  ],
);
