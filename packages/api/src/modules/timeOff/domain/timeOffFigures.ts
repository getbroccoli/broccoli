import Big from "big.js";

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
  // Decimal arithmetic, so a half hundredth such as 1.005 rounds as the ledger wrote it.
  const total = (kinds: readonly LedgerLineKind[]) =>
    sums
      .filter(({ kind }) => kinds.includes(kind))
      .reduce((sum, { amount }) => sum.plus(amount), Big(0))
      .round(2);
  const entitlement = total(ENTITLEMENT_KINDS);
  const bankHolidays = total(["bank_holiday_taken"]).neg();
  const used = total(["time_off_booked"]).neg();
  return {
    entitlement: toDays(entitlement),
    bankHolidays: toDays(bankHolidays),
    used: toDays(used),
    remaining: toDays(entitlement.minus(bankHolidays).minus(used)),
  };
}

function toDays(value: Big): number {
  // + 0 turns the -0 of a negated zero into 0.
  return value.toNumber() + 0;
}
