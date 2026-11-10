import type { Tx } from "../../../core/db";
import { allowanceRepository } from "../db";
import { type CostedDay, timeOffFigures, totalCost } from "../domain";
import type { Person } from "./allowanceEngine";
import type { ParsedBooking } from "./parseBooking";
import type { BalanceChange } from "./bookTimeOffService";

/** Each leave year's figures after the booking, and before it worked out from its cost there. */
export async function balancesAfter(
  tx: Tx,
  person: Person,
  { employeeId, timeOffTypeId }: ParsedBooking,
  booked: readonly CostedDay[],
): Promise<BalanceChange[]> {
  const repository = allowanceRepository(tx);
  const touched = (await repository.findByEmployees([employeeId])).filter(
    (allowance) =>
      allowance.timeOffTypeId === timeOffTypeId &&
      booked.some(({ date }) => allowance.leaveYearStart <= date && date <= allowance.leaveYearEnd),
  );
  const sums = await repository.findSumsByKind(touched.map(({ id }) => id));
  return touched.flatMap((allowance) => {
    const figures = timeOffFigures(sums.get(allowance.id) ?? []);
    const inYear = booked.filter(
      ({ date }) => allowance.leaveYearStart <= date && date <= allowance.leaveYearEnd,
    );
    const cost = totalCost(inYear);
    const version = person.timelineOf(timeOffTypeId).getVersionOnDate(inYear[0]!.date);
    // A year kept from before its policy stopped counting has no balance to show.
    if (!version || version.balance === "no_balance") {
      return [];
    }
    const counted = version.balance === "balance_from_allowance";
    return {
      periodStart: allowance.leaveYearStart,
      periodEnd: allowance.leaveYearEnd,
      balance: counted ? "balance_from_allowance" : "unlimited_balance",
      remainingBefore: counted ? figures.remaining + cost : null,
      remainingAfter: counted ? figures.remaining : null,
      usedBefore: figures.used - cost,
      usedAfter: figures.used,
    } satisfies BalanceChange;
  });
}
