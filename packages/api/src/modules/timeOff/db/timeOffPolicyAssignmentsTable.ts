import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, pgTable, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { timeOffPolicies } from "./timeOffPoliciesTable";
import { timeOffPolicyVersions } from "./timeOffPolicyVersionsTable";
import { timeOffTypes } from "./timeOffTypesTable";

/**
 * Who has a policy version for its type from a date to a date: one person ahead of their terms, or
 * one set of terms. An owner's rows for one type never overlap; the migration adds those exclusion
 * constraints and the foreign keys to employees and terms, which another module owns.
 */
export const timeOffPolicyAssignments = pgTable(
  "time_off_policy_assignments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    employeeId: uuid("employee_id"),
    termsId: uuid("terms_id"),
    timeOffTypeId: uuid("time_off_type_id").notNull(),
    timeOffPolicyId: uuid("time_off_policy_id").notNull(),
    timeOffPolicyVersionId: uuid("time_off_policy_version_id").notNull(),
    startDate: date("start_date", { mode: "string" }).$type<CalendarDate>().notNull(),
    /** The last day the row applies; null: open-ended. */
    endDate: date("end_date", { mode: "string" }).$type<CalendarDate>(),
  },
  (table) => [
    // Named here: the generated names would pass Postgres's 63-character limit.
    foreignKey({
      name: "time_off_policy_assignments_type_fk",
      columns: [table.timeOffTypeId],
      foreignColumns: [timeOffTypes.id],
    }),
    // Keeps the policy on the assignment's own type.
    foreignKey({
      name: "time_off_policy_assignments_policy_of_type_fk",
      columns: [table.timeOffPolicyId, table.timeOffTypeId],
      foreignColumns: [timeOffPolicies.id, timeOffPolicies.timeOffTypeId],
    }),
    // Keeps the version under the assignment's own policy.
    foreignKey({
      name: "time_off_policy_assignments_version_of_policy_fk",
      columns: [table.timeOffPolicyVersionId, table.timeOffPolicyId],
      foreignColumns: [timeOffPolicyVersions.id, timeOffPolicyVersions.timeOffPolicyId],
    }),
    index("time_off_policy_assignments_policy_idx").on(table.timeOffPolicyId),
    index("time_off_policy_assignments_version_idx").on(table.timeOffPolicyVersionId),
    index("time_off_policy_assignments_terms_idx").on(table.termsId),
    check(
      "time_off_policy_assignments_one_owner",
      sql`num_nonnulls(${table.employeeId}, ${table.termsId}) = 1`,
    ),
    check(
      "time_off_policy_assignments_dates_in_order",
      sql`${table.endDate} >= ${table.startDate}`,
    ),
  ],
);
