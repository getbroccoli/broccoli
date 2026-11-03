import Big from "big.js";
import type { CalendarDate } from "../../../utils";
import type { AllowanceCause } from "./allowanceCause";
import type { AllowanceTargetLine } from "./allowanceCalculator";

/** What an allowance's lines of one identity add up to now, and how many there are. */
export interface LedgerSum {
  kind: AllowanceTargetLine["kind"];
  allowanceRuleId: string | null;
  /** The effective date of bank holidays taken; null on other kinds. */
  bankHolidayDate: CalendarDate | null;
  /** Days as the database's decimal text. */
  amount: string;
  lineCount: number;
}

/** A line the engine appends. */
export interface NewLedgerLine {
  allowanceId: string;
  kind: AllowanceTargetLine["kind"];
  allowanceRuleId: string | null;
  effectiveDate: CalendarDate;
  /** Days with at most six decimal places. */
  amount: string;
  causeKind: Lowercase<AllowanceCause["kind"]>;
  causeRef: string | null;
  idempotencyKey: string;
}

/**
 * The lines that bring an allowance's identities from what they add up to now to their target, one
 * per identity that differs. The key counts the identity's existing lines, so a concurrent run of
 * the same change computes the same key and the unique index lets only one in.
 */
export function ledgerDifference(
  allowance: { id: string; leaveYearStart: CalendarDate },
  target: readonly AllowanceTargetLine[],
  current: readonly LedgerSum[],
  cause: AllowanceCause,
): NewLedgerLine[] {
  const targetOf = new Map(target.map((line) => [identityOf(line), line]));
  const currentOf = new Map(current.map((sum) => [identityOf(sum), sum]));
  // A line a dated change appends takes effect from that date.
  const changedFrom = DATED_CAUSES.has(cause.kind) ? (cause.ref as CalendarDate) : null;
  return [...new Set([...targetOf.keys(), ...currentOf.keys()])].flatMap((identity) => {
    const line = targetOf.get(identity);
    const sum = currentOf.get(identity);
    const difference = Big(line?.amount ?? 0).minus(sum?.amount ?? 0);
    if (difference.eq(0)) {
      return [];
    }
    const { kind, allowanceRuleId, bankHolidayDate } = (line ?? sum)!;
    const firstDate = line?.firstDate ?? allowance.leaveYearStart;
    const effectiveDate =
      bankHolidayDate ?? (changedFrom && changedFrom > firstDate ? changedFrom : firstDate);
    return [
      {
        allowanceId: allowance.id,
        kind,
        allowanceRuleId,
        effectiveDate,
        amount: difference.toString(),
        causeKind: cause.kind.toLowerCase() as NewLedgerLine["causeKind"],
        causeRef: cause.ref,
        idempotencyKey: `${allowance.id}:${identity}:${sum?.lineCount ?? 0}`,
      },
    ];
  });
}

function identityOf({
  kind,
  allowanceRuleId,
  bankHolidayDate,
}: Pick<LedgerSum, "kind" | "allowanceRuleId" | "bankHolidayDate">): string {
  return [kind, allowanceRuleId ?? bankHolidayDate].filter(Boolean).join(":");
}

const DATED_CAUSES = new Set<AllowanceCause["kind"]>([
  "START_DATE_CHANGED",
  "WORKING_PATTERN_CHANGED",
]);
