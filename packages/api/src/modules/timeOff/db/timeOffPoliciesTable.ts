import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { timeOffTypes } from "./timeOffTypesTable";

/**
 * The rules for one time off type: how leave is counted, bank holidays and the leave year. The
 * amounts are its allowance rules. `policy_group_id` names the group it applies to by default;
 * null means it is used only through assignments. The migration adds that foreign key, since
 * the employees module owns the groups.
 */
export const timeOffPolicies = pgTable(
  "time_off_policies",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    timeOffTypeId: uuid("time_off_type_id")
      .notNull()
      .references(() => timeOffTypes.id),
    name: text("name").notNull(),
    policyGroupId: uuid("policy_group_id"),
    balance: text("balance", {
      enum: ["balance_from_allowance", "unlimited_balance", "no_balance"],
    }).notNull(),
    bankHolidays: text("bank_holidays", {
      enum: ["bank_holidays_included_in_allowance", "bank_holidays_on_top_of_allowance"],
    }),
    leaveYearStart: text("leave_year_start", {
      enum: ["leave_year_from_fixed_date", "leave_year_from_employee_start_date"],
    }),
    leaveYearStartMonth: integer("leave_year_start_month"),
    leaveYearStartDay: integer("leave_year_start_day"),
  },
  (table) => [
    unique("time_off_policies_group_type_unique").on(table.policyGroupId, table.timeOffTypeId),
    // The target of the assignments' foreign key, which keeps a policy on its own type.
    unique("time_off_policies_id_type_unique").on(table.id, table.timeOffTypeId),
    check(
      "time_off_policies_bank_holidays_with_allowance",
      sql`(${table.bankHolidays} is not null) = (${table.balance} = 'balance_from_allowance')`,
    ),
    check(
      "time_off_policies_leave_year_with_balance",
      sql`(${table.leaveYearStart} is not null) = (${table.balance} <> 'no_balance')`,
    ),
    check(
      "time_off_policies_fixed_date_month_set",
      sql`(${table.leaveYearStartMonth} is not null)
        = (${table.leaveYearStart} is not distinct from 'leave_year_from_fixed_date')`,
    ),
    check(
      "time_off_policies_fixed_date_day_set",
      sql`(${table.leaveYearStartDay} is not null)
        = (${table.leaveYearStart} is not distinct from 'leave_year_from_fixed_date')`,
    ),
    // A day that exists in every year: never 29 February, never 31 April.
    check(
      "time_off_policies_fixed_date_valid",
      sql`${table.leaveYearStartMonth} between 1 and 12 and ${table.leaveYearStartDay} between 1 and
        case when ${table.leaveYearStartMonth} = 2 then 28
          when ${table.leaveYearStartMonth} in (4, 6, 9, 11) then 30 else 31 end`,
    ),
  ],
);
