import type { Transact } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import type { CalendarDate } from "../../../utils";
import { coversDate } from "../../employees";
import { allowanceRepository, timeOffPolicyRepository, timeOffRepository } from "../db";
import { type PolicyVersion, sharedBalance, type TimeOffPolicy, type TimeOffType } from "../domain";
import { byTypeOrder, calendarYearOf } from "./readTimeOffTypes";

/** Every time off type as Settings lists it, and how many people have time off. */
export interface TimeOffTypeList {
  timeOffTypes: {
    timeOffType: TimeOffType;
    /**
     * The kind most of its policies share today, the oldest policy's on a tie; null when no policy
     * applies today.
     */
    balance: PolicyVersion["balance"] | null;
    /** Everyone's approved or pending days in the calendar year of today; a half day is 0.5. */
    daysTakenThisYear: number;
  }[];
  /** People with an allowance whose leave year has not ended. */
  peopleWithTimeOff: number;
}

type Dependencies = { transact: Transact; today: () => CalendarDate };

/** Every time off type in list order, with how it counts and the days taken this year. */
export async function listTimeOffTypes(
  { transact, today }: Dependencies,
  ctx: SecurityContext,
): Promise<TimeOffTypeList> {
  ctx.require("MANAGE_WORKSPACE");
  const year = calendarYearOf(today());
  const { types, policies, takenDays, peopleWithTimeOff } = await transact(async (tx) => {
    const policyRepository = timeOffPolicyRepository(tx);
    return {
      types: await policyRepository.findAllTypes(),
      policies: await policyRepository.findAll(),
      takenDays: await timeOffRepository(tx).sumDaysByType({ from: year.start, until: year.end }),
      peopleWithTimeOff: await allowanceRepository(tx).countEmployeesWithAllowanceUntil(today()),
    };
  });
  return {
    timeOffTypes: types.sort(byTypeOrder).map((timeOffType) => ({
      timeOffType,
      balance: sharedBalance(countingToday(policies, timeOffType.id, today())),
      daysTakenThisYear:
        takenDays.find(({ timeOffTypeId }) => timeOffTypeId === timeOffType.id)?.days ?? 0,
    })),
    peopleWithTimeOff,
  };
}

/** The type's policies as each counts today; a policy with no version today is left out. */
function countingToday(
  policies: readonly TimeOffPolicy[],
  timeOffTypeId: string,
  date: CalendarDate,
): { id: string; balance: PolicyVersion["balance"] }[] {
  return policies
    .filter(({ timeOffType }) => timeOffType.id === timeOffTypeId)
    .flatMap(({ id, versions }) => {
      const version = versions.find((candidate) => coversDate(candidate, date));
      return version ? [{ id, balance: version.balance }] : [];
    });
}
