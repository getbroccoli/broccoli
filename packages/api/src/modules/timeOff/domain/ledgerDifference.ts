import Big from "big.js";
import type { CalendarDate } from "../../../utils";
import type { AllowanceCause } from "./allowanceCause";
import type { AllowanceTargetLine } from "./allowanceTarget";

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
  const identities = new Map<string, { target?: AllowanceTargetLine; current?: LedgerSum }>();
  for (const line of target) {
    identities.set(identityOf(line), { target: line });
  }
  for (const sum of current) {
    identities.set(identityOf(sum), { ...identities.get(identityOf(sum)), current: sum });
  }
  return [...identities].flatMap(([identity, { target: line, current: sum }]) => {
    const difference = Big(line?.amount ?? 0).minus(sum?.amount ?? 0);
    if (difference.eq(0)) {
      return [];
    }
    const { kind, allowanceRuleId, bankHolidayDate } = (line ?? sum)!;
    // shortcut: a changed grant takes effect from its first contributing day, not from the first part that changed; narrow it when the balance history shows dates.
    const effectiveDate = bankHolidayDate ?? line?.firstDate ?? allowance.leaveYearStart;
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
