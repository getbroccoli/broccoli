import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timeOffPolicies } from "./timeOffPoliciesTable";

/**
 * A policy's rules, with no dates: how leave is counted, bank holidays and the leave year; the
 * amounts are its allowance rules. A draft is edited until it is published; a published version
 * never changes. The migration adds the foreign key to terms, which another module owns.
 */
export const timeOffPolicyVersions = pgTable(
  "time_off_policy_versions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    timeOffPolicyId: uuid("time_off_policy_id").notNull(),
    status: text("status", { enum: ["draft", "published"] }).notNull(),
    /** Set only on a draft: the terms whose screen saved it; publishing clears it. */
    termsId: uuid("terms_id"),
    /** 1 on creation, plus 1 on every save of a draft, so Publish sees what the admin reviewed. */
    revision: integer("revision").notNull().default(1),
    /** Set only on a draft that stops the type: publishing ends the rules instead of giving these. */
    stops: boolean("stops").notNull().default(false),
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
    // The target of the assignments' foreign key, which keeps a version under its policy.
    unique("time_off_policy_versions_id_policy_unique").on(table.id, table.timeOffPolicyId),
    uniqueIndex("time_off_policy_versions_one_draft_per_terms")
      .on(table.timeOffPolicyId, table.termsId)
      .where(sql`${table.status} = 'draft'`),
    check("time_off_policy_versions_status_known", sql`${table.status} in ('draft', 'published')`),
    check(
      "time_off_policy_versions_terms_only_on_draft",
      sql`(${table.termsId} is not null) = (${table.status} = 'draft')`,
    ),
    check(
      "time_off_policy_versions_stops_only_on_draft",
      sql`not ${table.stops} or ${table.status} = 'draft'`,
    ),
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
