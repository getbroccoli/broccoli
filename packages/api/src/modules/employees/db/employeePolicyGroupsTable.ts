import { sql } from "drizzle-orm";
import { check, date, index, pgTable, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { employees } from "./employeesTable";
import { policyGroups } from "./policyGroupsTable";

/**
 * Which group a person is in, and when; one group at a time, so a person's rows never overlap
 * (an exclusion constraint the migration adds). It counts only while they have an employment.
 */
export const employeePolicyGroups = pgTable(
  "employee_policy_groups",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    policyGroupId: uuid("policy_group_id")
      .notNull()
      .references(() => policyGroups.id),
    /** Null: since the employment started, for a person whose start date is unknown. */
    effectiveFrom: date("effective_from", { mode: "string" }).$type<CalendarDate>(),
    /** The last day the row applies; null: still in the group. */
    effectiveUntil: date("effective_until", { mode: "string" }).$type<CalendarDate>(),
  },
  (table) => [
    index("employee_policy_groups_policy_group_idx").on(table.policyGroupId),
    check(
      "employee_policy_groups_dates_in_order",
      sql`${table.effectiveUntil} >= ${table.effectiveFrom}`,
    ),
  ],
);
