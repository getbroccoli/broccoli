import { and, countDistinct, gte, inArray, ne, sql } from "drizzle-orm";

import { ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import type { LedgerLineKind, LedgerSum, NewLedgerLine } from "../domain";
import { allowanceLedgerLines } from "./allowanceLedgerLinesTable";
import { allowances } from "./allowancesTable";

/** One person's allowance for one type and leave year. */
export interface Allowance {
  id: string;
  employeeId: string;
  timeOffTypeId: string;
  leaveYearStart: CalendarDate;
  leaveYearEnd: CalendarDate;
}

/** Allowances and their ledger lines, inside a transaction. */
export interface AllowanceRepository {
  findByEmployees(employeeIds: readonly string[]): Promise<Allowance[]>;
  /** How many people have an allowance whose leave year ends on `date` or later. */
  countEmployeesWithAllowanceUntil(date: CalendarDate): Promise<number>;
  insert(newAllowances: readonly Omit<Allowance, "id">[]): Promise<Allowance[]>;
  /** What the engine's lines of each identity add up to, by allowance id. */
  findEngineSums(allowanceIds: readonly string[]): Promise<Map<string, LedgerSum[]>>;
  /** What each allowance's lines of each kind add up to, by allowance id. */
  findSumsByKind(
    allowanceIds: readonly string[],
  ): Promise<Map<string, { kind: LedgerLineKind; amount: number }[]>>;
  /** Appends the lines, skipping those whose idempotency key is taken; returns how many it added. */
  insertLines(lines: readonly NewLedgerLine[]): Promise<number>;
}

export function allowanceRepository(tx: Tx): AllowanceRepository {
  const orm = () => ormOf(tx);
  return {
    findByEmployees(employeeIds) {
      return orm()
        .select()
        .from(allowances)
        .where(inArray(allowances.employeeId, [...employeeIds]))
        .orderBy(allowances.leaveYearStart);
    },

    async countEmployeesWithAllowanceUntil(date) {
      const [row] = await orm()
        .select({ count: countDistinct(allowances.employeeId) })
        .from(allowances)
        .where(gte(allowances.leaveYearEnd, date));
      return row!.count;
    },

    async insert(newAllowances) {
      const inserted: Allowance[] = [];
      for (let start = 0; start < newAllowances.length; start += INSERT_BATCH_SIZE) {
        const batch = newAllowances.slice(start, start + INSERT_BATCH_SIZE);
        inserted.push(...(await orm().insert(allowances).values(batch).returning()));
      }
      return inserted;
    },

    async findEngineSums(allowanceIds) {
      const bankHolidayDate = sql<CalendarDate | null>`case when ${allowanceLedgerLines.kind} = 'bank_holiday_taken' then ${allowanceLedgerLines.effectiveDate} end`;
      const rows = await orm()
        .select({
          allowanceId: allowanceLedgerLines.allowanceId,
          kind: allowanceLedgerLines.kind,
          allowanceRuleId: allowanceLedgerLines.allowanceRuleId,
          bankHolidayDate,
          timeOffDayId: allowanceLedgerLines.timeOffDayId,
          bookedDate: sql<CalendarDate | null>`case when ${allowanceLedgerLines.kind} = 'time_off_booked' then min(${allowanceLedgerLines.effectiveDate}) end`,
          amount: sql<string>`sum(${allowanceLedgerLines.amount})`,
          lineCount: sql<number>`count(*)::int`,
        })
        .from(allowanceLedgerLines)
        .where(
          and(
            inArray(allowanceLedgerLines.allowanceId, [...allowanceIds]),
            ne(allowanceLedgerLines.kind, "manual_adjustment"),
          ),
        )
        .groupBy(
          allowanceLedgerLines.allowanceId,
          allowanceLedgerLines.kind,
          allowanceLedgerLines.allowanceRuleId,
          bankHolidayDate,
          allowanceLedgerLines.timeOffDayId,
        );
      const sums = rows.map((row) => ({ ...row, kind: row.kind as LedgerSum["kind"] }));
      return Map.groupBy(sums, ({ allowanceId }) => allowanceId);
    },

    async findSumsByKind(allowanceIds) {
      const rows = await orm()
        .select({
          allowanceId: allowanceLedgerLines.allowanceId,
          kind: allowanceLedgerLines.kind,
          amount: sql<string>`sum(${allowanceLedgerLines.amount})`,
        })
        .from(allowanceLedgerLines)
        .where(inArray(allowanceLedgerLines.allowanceId, [...allowanceIds]))
        .groupBy(allowanceLedgerLines.allowanceId, allowanceLedgerLines.kind);
      const sums = rows.map((row) => ({ ...row, amount: Number(row.amount) }));
      return Map.groupBy(sums, ({ allowanceId }) => allowanceId);
    },

    async insertLines(lines) {
      let added = 0;
      for (let start = 0; start < lines.length; start += INSERT_BATCH_SIZE) {
        const batch = lines.slice(start, start + INSERT_BATCH_SIZE);
        const rows = await orm()
          .insert(allowanceLedgerLines)
          .values(
            batch.map((line) => ({
              ...line,
              unit: "days" as const,
              authorKind: "broccoli_itself",
              authorId: null,
            })),
          )
          .onConflictDoNothing({ target: allowanceLedgerLines.idempotencyKey })
          .returning({ id: allowanceLedgerLines.id });
        added += rows.length;
      }
      return added;
    },
  };
}

/** Rows per insert, well below Postgres's limit of 65,535 parameters. */
const INSERT_BATCH_SIZE = 1_000;
