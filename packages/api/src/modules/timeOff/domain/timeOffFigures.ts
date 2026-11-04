/** The kinds of an allowance's ledger lines. */
export type LedgerLineKind =
  | "entitlement_grant"
  | "bank_holiday_allowance_grant"
  | "bank_holiday_taken"
  | "time_off_booked"
  | "manual_adjustment"
  | "rounding_up_to_half_day";

/** An allowance's figures as a person reads them, in days. */
export interface TimeOffFigures {
  /** Everything granted for the leave year, bank holidays on top and adjustments included. */
  entitlement: number;
  bankHolidays: number;
  used: number;
  remaining: number;
}

const ENTITLEMENT_KINDS: readonly LedgerLineKind[] = [
  "entitlement_grant",
  "bank_holiday_allowance_grant",
  "rounding_up_to_half_day",
  "manual_adjustment",
];

/**
 * An allowance's figures from the sums of its lines by kind, each to two decimals; remaining is
 * derived from the rounded figures so a row always adds up.
 */
export function timeOffFigures(
  sums: readonly { kind: LedgerLineKind; amount: number }[],
): TimeOffFigures {
  const total = (kinds: readonly LedgerLineKind[]) =>
    sums.filter(({ kind }) => kinds.includes(kind)).reduce((sum, { amount }) => sum + amount, 0);
  const entitlement = toHundredths(total(ENTITLEMENT_KINDS));
  const bankHolidays = toHundredths(-total(["bank_holiday_taken"]));
  const used = toHundredths(-total(["time_off_booked"]));
  return {
    entitlement,
    bankHolidays,
    used,
    remaining: toHundredths(entitlement - bankHolidays - used),
  };
}

function toHundredths(days: number): number {
  // + 0 turns -0 into 0.
  return Math.round(days * 100) / 100 + 0;
}
