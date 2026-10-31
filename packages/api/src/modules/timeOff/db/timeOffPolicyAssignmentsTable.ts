import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, pgTable, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { timeOffPolicies } from "./timeOffPoliciesTable";
import { timeOffTypes } from "./timeOffTypesTable";

/**
 * An exception: one person on a policy for one type between two dates, ahead of their group's
 * policy. A person's rows for one type never overlap; the migration adds that exclusion
 * constraint and the foreign key to employees, which another module owns.
 */
export const timeOffPolicyAssignments = pgTable(
  "time_off_policy_assignments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    employeeId: uuid("employee_id").notNull(),
    timeOffTypeId: uuid("time_off_type_id").notNull(),
    timeOffPolicyId: uuid("time_off_policy_id").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).$type<CalendarDate>().notNull(),
    /** The last day the row applies; null: open-ended. */
    effectiveUntil: date("effective_until", { mode: "string" }).$type<CalendarDate>(),
  },
  (table) => [
    // Named here: the generated name would pass Postgres's 63-character limit.
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
    index("time_off_policy_assignments_policy_idx").on(table.timeOffPolicyId),
    check(
      "time_off_policy_assignments_dates_in_order",
      sql`${table.effectiveUntil} >= ${table.effectiveFrom}`,
    ),
  ],
);
