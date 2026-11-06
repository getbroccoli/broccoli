import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { timeOffPolicies } from "./timeOffPoliciesTable";

/**
 * A policy's rules from a date to a date: how leave is counted, bank holidays and the leave year;
 * the amounts are its allowance rules. Never edited: a change ends one and adds the next. A
 * policy's versions never overlap (an exclusion constraint the migration adds).
 */
export const timeOffPolicyVersions = pgTable(
  "time_off_policy_versions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    timeOffPolicyId: uuid("time_off_policy_id").notNull(),
    /** Null: from the beginning. */
    startDate: date("start_date", { mode: "string" }).$type<CalendarDate>(),
    /** The last day it applies; null: open-ended. */
    endDate: date("end_date", { mode: "string" }).$type<CalendarDate>(),
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
    // Named here: the generated name would pass Postgres's 63-character limit.
    foreignKey({
      name: "time_off_policy_versions_policy_fk",
      columns: [table.timeOffPolicyId],
      foreignColumns: [timeOffPolicies.id],
    }).onDelete("cascade"),
    index("time_off_policy_versions_policy_idx").on(table.timeOffPolicyId),
    check("time_off_policy_versions_dates_in_order", sql`${table.endDate} >= ${table.startDate}`),
    check(
      "time_off_policy_versions_bank_holidays_with_allowance",
      sql`(${table.bankHolidays} is not null) = (${table.balance} = 'balance_from_allowance')`,
    ),
    check(
      "time_off_policy_versions_leave_year_with_balance",
      sql`(${table.leaveYearStart} is not null) = (${table.balance} <> 'no_balance')`,
    ),
    check(
      "time_off_policy_versions_fixed_date_month_set",
      sql`(${table.leaveYearStartMonth} is not null)
        = (${table.leaveYearStart} is not distinct from 'leave_year_from_fixed_date')`,
    ),
    check(
      "time_off_policy_versions_fixed_date_day_set",
      sql`(${table.leaveYearStartDay} is not null)
        = (${table.leaveYearStart} is not distinct from 'leave_year_from_fixed_date')`,
    ),
    // A day that exists in every year: never 29 February, never 31 April.
    check(
      "time_off_policy_versions_fixed_date_valid",
      sql`${table.leaveYearStartMonth} between 1 and 12 and ${table.leaveYearStartDay} between 1 and
        case when ${table.leaveYearStartMonth} = 2 then 28
          when ${table.leaveYearStartMonth} in (4, 6, 9, 11) then 30 else 31 end`,
    ),
  ],
);
