import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, pgTable, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { policyGroups } from "./policyGroupsTable";
import { workingPatternPolicies } from "./workingPatternPoliciesTable";

/**
 * Which policy a group's members work by default, and when; a group's rows never overlap (an
 * exclusion constraint the migration adds). Dated, so switching a group keeps its past weeks.
 */
export const policyGroupWorkingPatterns = pgTable(
  "policy_group_working_patterns",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    policyGroupId: uuid("policy_group_id").notNull(),
    workingPatternPolicyId: uuid("working_pattern_policy_id").notNull(),
    /** Null: from the beginning. */
    effectiveFrom: date("effective_from", { mode: "string" }).$type<CalendarDate>(),
    /** The last day the row applies; null: open-ended. */
    effectiveUntil: date("effective_until", { mode: "string" }).$type<CalendarDate>(),
  },
  (table) => [
    // Named here: the generated names would pass Postgres's 63-character limit.
    foreignKey({
      name: "policy_group_working_patterns_group_fk",
      columns: [table.policyGroupId],
      foreignColumns: [policyGroups.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "policy_group_working_patterns_policy_fk",
      columns: [table.workingPatternPolicyId],
      foreignColumns: [workingPatternPolicies.id],
    }),
    index("policy_group_working_patterns_policy_idx").on(table.workingPatternPolicyId),
    check(
      "policy_group_working_patterns_dates_in_order",
      sql`${table.effectiveUntil} >= ${table.effectiveFrom}`,
    ),
  ],
);
