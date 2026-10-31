import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { allowances } from "./allowancesTable";
import { timeOffAllowanceRules } from "./timeOffAllowanceRulesTable";
import { timeOffDays } from "./timeOffDaysTable";

/**
 * Every change to an allowance, only ever appended: a correction is a new line. The engine
 * appends the difference between its target and what is there, so any kind can take either
 * sign; the kind keeps its meaning and the sign says which way it moved.
 */
export const allowanceLedgerLines = pgTable(
  "allowance_ledger_lines",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    allowanceId: uuid("allowance_id")
      .notNull()
      .references(() => allowances.id, { onDelete: "cascade" }),
    effectiveDate: date("effective_date", { mode: "string" }).$type<CalendarDate>().notNull(),
    unit: text("unit", { enum: ["days"] }).notNull(),
    amount: numeric("amount").notNull(),
    kind: text("kind", {
      enum: [
        "entitlement_grant",
        "bank_holiday_allowance_grant",
        "bank_holiday_taken",
        "time_off_booked",
        "manual_adjustment",
        "rounding_up_to_half_day",
      ],
    }).notNull(),
    /** Why the line exists, such as `working_pattern_changed`, and the id or date it points at. */
    causeKind: text("cause_kind").notNull(),
    causeRef: text("cause_ref"),
    /** Set on entitlement grants, so the balance reads by rule. */
    allowanceRuleId: uuid("allowance_rule_id"),
    /** Set on booked lines; a day's lines add up to its current cost. */
    timeOffDayId: uuid("time_off_day_id").references(() => timeOffDays.id),
    reason: text("reason"),
    /** As in record history. */
    authorKind: text("author_kind").notNull(),
    authorId: text("author_id"),
    /** A retried write appends nothing. */
    idempotencyKey: text("idempotency_key")
      .notNull()
      .unique("allowance_ledger_lines_idempotency_key_unique"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Named here: the generated name would pass Postgres's 63-character limit.
    foreignKey({
      name: "allowance_ledger_lines_allowance_rule_fk",
      columns: [table.allowanceRuleId],
      foreignColumns: [timeOffAllowanceRules.id],
    }),
    index("allowance_ledger_lines_allowance_idx").on(table.allowanceId),
    index("allowance_ledger_lines_allowance_rule_idx").on(table.allowanceRuleId),
    index("allowance_ledger_lines_time_off_day_idx").on(table.timeOffDayId),
    check(
      "allowance_ledger_lines_manual_adjustment_reason",
      sql`${table.kind} <> 'manual_adjustment' or ${table.reason} is not null`,
    ),
  ],
);
