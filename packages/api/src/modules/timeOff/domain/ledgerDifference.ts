import Big from "big.js";
import type { CalendarDate } from "../../../utils";
import type { AllowanceCause } from "./allowanceCause";
import type { CalculatedAllowanceLine } from "./allowanceCalculator";

/** What an allowance's lines of one identity add up to now, and how many there are. */
export interface LedgerSum {
  kind: CalculatedAllowanceLine["kind"];
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
  kind: CalculatedAllowanceLine["kind"];
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
 * the same change computes the same key and the unique index lets only one in. A start correction
 * supplies the previous calculation so grants cannot change before their contributing parts.
 */
export function ledgerDifference(
  allowance: { id: string; leaveYearStart: CalendarDate; leaveYearEnd: CalendarDate },
  target: readonly CalculatedAllowanceLine[],
  current: readonly LedgerSum[],
  cause: AllowanceCause,
  previous: readonly CalculatedAllowanceLine[] = [],
): NewLedgerLine[] {
  const targetOf = new Map(target.map((line) => [identityOf(line), line]));
  const previousOf = new Map(previous.map((line) => [identityOf(line), line]));
  const currentOf = new Map(current.map((sum) => [identityOf(sum), sum]));
  const changedGrantsFrom = firstChangedGrantDate([...previous, ...target], targetOf, previousOf);
  return [...new Set([...targetOf.keys(), ...currentOf.keys()])].flatMap((identity) => {
    const line = targetOf.get(identity);
    const sum = currentOf.get(identity);
    const difference = Big(line?.amount ?? 0).minus(sum?.amount ?? 0);
    if (difference.eq(0)) {
      return [];
    }
    const { kind, allowanceRuleId, bankHolidayDate } = (line ?? sum)!;
    const previousLine = previousOf.get(identity);
    const firstDate =
      [line?.firstDate, previousLine?.firstDate]
        .filter((date): date is CalendarDate => date !== undefined)
        .toSorted()[0] ?? allowance.leaveYearStart;
    const contributedFrom =
      kind === "rounding_up_to_half_day" ? (changedGrantsFrom ?? firstDate) : firstDate;
    const changedFrom =
      current.length > 0
        ? correctionDate(cause, contributedFrom, allowance.leaveYearStart)
        : line!.firstDate;
    return [
      {
        allowanceId: allowance.id,
        kind,
        allowanceRuleId,
        effectiveDate: withinLeaveYear(bankHolidayDate ?? changedFrom, allowance),
        amount: difference.toString(),
        causeKind: cause.kind.toLowerCase() as NewLedgerLine["causeKind"],
        causeRef: cause.ref,
        idempotencyKey: `${allowance.id}:${identity}:${sum?.lineCount ?? 0}`,
      },
    ];
  });
}

/** The earliest first date of a grant whose amount differs between the two calculations. */
function firstChangedGrantDate(
  lines: readonly CalculatedAllowanceLine[],
  targetOf: ReadonlyMap<string, CalculatedAllowanceLine>,
  previousOf: ReadonlyMap<string, CalculatedAllowanceLine>,
): CalendarDate | undefined {
  return lines
    .filter(
      (line) =>
        line.kind !== "bank_holiday_taken" &&
        line.kind !== "rounding_up_to_half_day" &&
        !Big(targetOf.get(identityOf(line))?.amount ?? 0).eq(
          previousOf.get(identityOf(line))?.amount ?? 0,
        ),
    )
    .map(({ firstDate }) => firstDate)
    .toSorted()[0];
}

function withinLeaveYear(
  date: CalendarDate,
  { leaveYearStart, leaveYearEnd }: { leaveYearStart: CalendarDate; leaveYearEnd: CalendarDate },
): CalendarDate {
  return date < leaveYearStart ? leaveYearStart : date > leaveYearEnd ? leaveYearEnd : date;
}

function identityOf({
  kind,
  allowanceRuleId,
  bankHolidayDate,
}: Pick<LedgerSum, "kind" | "allowanceRuleId" | "bankHolidayDate">): string {
  return [kind, allowanceRuleId ?? bankHolidayDate].filter(Boolean).join(":");
}

function correctionDate(
  cause: AllowanceCause,
  firstDate: CalendarDate,
  leaveYearStart: CalendarDate,
): CalendarDate {
  if (cause.kind === "START_DATE_CHANGED") {
    const { ref, previousStartDate } = cause;
    // Moving a start and reversing it affect the same interval; null is an open start.
    const changedFrom =
      ref === null || previousStartDate === null
        ? leaveYearStart
        : ref < previousStartDate
          ? ref
          : previousStartDate;
    return changedFrom > firstDate ? changedFrom : firstDate;
  }
  const changedFrom =
    cause.kind === "TIME_OFF_RULES_CHANGED"
      ? cause.from
      : cause.kind === "WORKING_PATTERN_CHANGED"
        ? (cause.ref as CalendarDate | null)
        : null;
  return changedFrom && changedFrom > firstDate ? changedFrom : firstDate;
}
