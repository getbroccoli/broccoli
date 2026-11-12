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
    // A year can change how the type counts partway through: days booked under allowance rules
    // show the allowance's figures and cost only those days, as the ledger does. A year with no
    // day counted at all, such as one kept from before its policy stopped counting, shows none.
    const timeline = person.timelineOf(timeOffTypeId);
    const balanceOn = ({ date }: CostedDay) => timeline.getVersionOnDate(date)?.balance;
    if (!inYear.some((day) => balanceOn(day) && balanceOn(day) !== "no_balance")) {
      return [];
    }
    const fromAllowance = inYear.filter((day) => balanceOn(day) === "balance_from_allowance");
    const counted = fromAllowance.length > 0;
    const cost = totalCost(counted ? fromAllowance : inYear);
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
