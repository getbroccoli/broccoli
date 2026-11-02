import { and, inArray, notInArray, sql } from "drizzle-orm";

import { ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import type { LedgerSum, NewLedgerLine } from "../domain";
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
  /**
   * Holds each employee's allowances for the engine until the transaction ends, so two runs for
   * one person never interleave; locks in id order, so runs over overlapping people cannot deadlock.
   */
  lockEmployees(employeeIds: readonly string[]): Promise<void>;
  findByEmployees(employeeIds: readonly string[]): Promise<Allowance[]>;
  insert(newAllowances: readonly Omit<Allowance, "id">[]): Promise<Allowance[]>;
  /** What the engine's lines of each identity add up to, by allowance id. */
  findEngineSums(allowanceIds: readonly string[]): Promise<Map<string, LedgerSum[]>>;
  /** Appends the lines, skipping those whose idempotency key is taken; returns how many it added. */
  insertLines(lines: readonly NewLedgerLine[]): Promise<number>;
}

export function allowanceRepository(tx: Tx): AllowanceRepository {
  const orm = () => ormOf(tx);
  return {
    async lockEmployees(employeeIds) {
      await orm().execute(
        sql`select pg_advisory_xact_lock(${LOCK_CLASS}, hashtext(id::text))
          from unnest(${sql.param([...employeeIds].toSorted())}::uuid[]) with ordinality as e(id, n)
          order by n`,
      );
    },

    findByEmployees(employeeIds) {
      return orm()
        .select()
        .from(allowances)
        .where(inArray(allowances.employeeId, [...employeeIds]))
        .orderBy(allowances.leaveYearStart);
    },

    async insert(newAllowances) {
      return newAllowances.length === 0
        ? []
        : orm()
            .insert(allowances)
            .values([...newAllowances])
            .returning();
    },

    async findEngineSums(allowanceIds) {
      const bankHolidayDate = sql<CalendarDate | null>`case when ${allowanceLedgerLines.kind} = 'bank_holiday_taken' then ${allowanceLedgerLines.effectiveDate} end`;
      const rows = await orm()
        .select({
          allowanceId: allowanceLedgerLines.allowanceId,
          kind: allowanceLedgerLines.kind,
          allowanceRuleId: allowanceLedgerLines.allowanceRuleId,
          bankHolidayDate,
          amount: sql<string>`sum(${allowanceLedgerLines.amount})`,
          lineCount: sql<number>`count(*)::int`,
        })
        .from(allowanceLedgerLines)
        .where(
          and(
            inArray(allowanceLedgerLines.allowanceId, [...allowanceIds]),
            notInArray(allowanceLedgerLines.kind, ["time_off_booked", "manual_adjustment"]),
          ),
        )
        .groupBy(
          allowanceLedgerLines.allowanceId,
          allowanceLedgerLines.kind,
          allowanceLedgerLines.allowanceRuleId,
          bankHolidayDate,
        );
      const sums = new Map<string, LedgerSum[]>();
      for (const { allowanceId, kind, amount, ...sum } of rows) {
        const engineKind = kind as LedgerSum["kind"];
        sums.set(allowanceId, [
          ...(sums.get(allowanceId) ?? []),
          { ...sum, kind: engineKind, amount: Number(amount) },
        ]);
      }
      return sums;
    },

    async insertLines(lines) {
      if (lines.length === 0) {
        return 0;
      }
      const added = await orm()
        .insert(allowanceLedgerLines)
        .values(
          lines.map((line) => ({
            ...line,
            unit: "days" as const,
            authorKind: "broccoli_itself",
            authorId: null,
          })),
        )
        .onConflictDoNothing({ target: allowanceLedgerLines.idempotencyKey })
        .returning({ id: allowanceLedgerLines.id });
      return added.length;
    },
  };
}

/** The advisory lock's first key, so the engine's per-employee locks clash with no other lock. */
const LOCK_CLASS = 2090;
