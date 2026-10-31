import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timeOffPolicies } from "./timeOffPoliciesTable";

/**
 * The parts of a policy's allowance, which add up into one balance. A rule a ledger line points
 * at is never deleted: removing it sets `removed_at` and stops it from the current leave year.
 */
export const timeOffAllowanceRules = pgTable(
  "time_off_allowance_rules",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    timeOffPolicyId: uuid("time_off_policy_id").notNull(),
    kind: text("kind", { enum: ["yearly_entitlement", "service_extra"] }).notNull(),
    /**
     * Entitlement as contracts state it: `entitlementDays` for a working week of
     * `entitlementDaysPerWeek` days, pro-rated to the person's own days per week.
     * UK statutory minimum (Working Time Regulations 1998, regs 13 and 13A): 5.6 weeks,
     * capped at 28 days, so 28 for 5 with `maxDays` 28 (3 days a week: 16.8; 6 days: 28).
     * The 5.6 weeks may include bank holidays. Germany (BUrlG §3): 24 for 6.
     */
    entitlementDays: numeric("entitlement_days"),
    entitlementDaysPerWeek: integer("entitlement_days_per_week"),
    /** The most a full year can grant, whatever the working pattern. */
    maxDays: numeric("max_days"),
    /** Each step is the total extra from that anniversary; the highest step reached applies. */
    afterYears: integer("after_years"),
    extraDays: numeric("extra_days"),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    // Named here: the generated name would pass Postgres's 63-character limit.
    foreignKey({
      name: "time_off_allowance_rules_policy_fk",
      columns: [table.timeOffPolicyId],
      foreignColumns: [timeOffPolicies.id],
    }),
    index("time_off_allowance_rules_policy_idx").on(table.timeOffPolicyId),
    uniqueIndex("time_off_allowance_rules_one_yearly_entitlement")
      .on(table.timeOffPolicyId)
      .where(sql`${table.kind} = 'yearly_entitlement' and ${table.removedAt} is null`),
    uniqueIndex("time_off_allowance_rules_one_service_step")
      .on(table.timeOffPolicyId, table.afterYears)
      .where(sql`${table.kind} = 'service_extra' and ${table.removedAt} is null`),
    check(
      "time_off_allowance_rules_yearly_entitlement_columns",
      sql`${table.kind} <> 'yearly_entitlement' or (
        ${table.entitlementDays} >= 0 and ${table.entitlementDaysPerWeek} between 1 and 7
        and (${table.maxDays} is null or ${table.maxDays} >= 0)
        and ${table.afterYears} is null and ${table.extraDays} is null)`,
    ),
    check(
      "time_off_allowance_rules_service_extra_columns",
      sql`${table.kind} <> 'service_extra' or (
        ${table.afterYears} >= 1 and ${table.extraDays} >= 0
        and ${table.entitlementDays} is null and ${table.entitlementDaysPerWeek} is null
        and ${table.maxDays} is null)`,
    ),
  ],
);
