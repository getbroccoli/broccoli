import Big from "big.js";
import type { CalendarDate } from "../../../utils";
import type { AllowanceCause } from "./allowanceCause";
import type { CalculatedAllowanceLine } from "./allowanceCalculator";

/** What one booked day should cost its allowance: minus its cost while booked, 0 once cancelled. */
export interface BookedDayLine {
  kind: "time_off_booked";
  allowanceRuleId: null;
  bankHolidayDate: null;
  timeOffDayId: string;
  amount: string;
  /** The booked day, which is also the line's effective date. */
  firstDate: CalendarDate;
}

/** One line identity of an allowance and the amount its lines should add up to. */
export type TargetLine = CalculatedAllowanceLine | BookedDayLine;

/** What an allowance's lines of one identity add up to now, and how many there are. */
export interface LedgerSum {
  kind: TargetLine["kind"];
  allowanceRuleId: string | null;
  /** The effective date of bank holidays taken; null on other kinds. */
  bankHolidayDate: CalendarDate | null;
  /** Set on booked days, with the day they are booked on. */
  timeOffDayId?: string | null;
  bookedDate?: CalendarDate | null;
  /** Days as the database's decimal text. */
  amount: string;
  lineCount: number;
}

/** A line the engine appends. */
export interface NewLedgerLine {
  allowanceId: string;
  kind: TargetLine["kind"];
  allowanceRuleId: string | null;
  timeOffDayId: string | null;
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
  target: readonly TargetLine[],
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
    const timeOffDayId =
      line && "timeOffDayId" in line ? line.timeOffDayId : (sum?.timeOffDayId ?? null);
    const bookedDate = kind === "time_off_booked" ? (line?.firstDate ?? sum?.bookedDate) : null;
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
        timeOffDayId,
        effectiveDate: withinLeaveYear(bankHolidayDate ?? bookedDate ?? changedFrom, allowance),
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
  lines: readonly TargetLine[],
  targetOf: ReadonlyMap<string, TargetLine>,
  previousOf: ReadonlyMap<string, TargetLine>,
): CalendarDate | undefined {
  return lines
    .filter(
      (line) =>
        line.kind !== "bank_holiday_taken" &&
        line.kind !== "rounding_up_to_half_day" &&
        line.kind !== "time_off_booked" &&
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
  timeOffDayId,
}: Pick<LedgerSum, "kind" | "allowanceRuleId" | "bankHolidayDate" | "timeOffDayId">): string {
  return [kind, allowanceRuleId ?? bankHolidayDate ?? timeOffDayId].filter(Boolean).join(":");
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
      : cause.kind === "WORKING_PATTERN_CHANGED" || cause.kind === "TERMS_CHANGED"
        ? (cause.ref as CalendarDate | null)
        : null;
  return changedFrom && changedFrom > firstDate ? changedFrom : firstDate;
}
