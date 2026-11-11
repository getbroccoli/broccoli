import type { Transact } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, coversDate } from "../../../utils";
import {
  allowanceRepository,
  type PolicyAssignment,
  timeOffPolicyRepository,
  timeOffRepository,
} from "../db";
import { type PolicyVersion, sharedBalance, type TimeOffPolicy, type TimeOffType } from "../domain";
import { byTypeOrder, calendarYearOf } from "./readTimeOffTypes";

/** Every time off type as Settings lists it, and how many people have time off. */
export interface TimeOffTypeList {
  timeOffTypes: {
    timeOffType: TimeOffType;
    /**
     * The kind most of its policies share today, else by their latest version, the oldest policy's
     * on a tie; null with no policy.
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
  const { types, policies, assignments, takenDays, peopleWithTimeOff } = await transact(
    async (tx) => {
      const policyRepository = timeOffPolicyRepository(tx);
      return {
        types: await policyRepository.findAllTypes(),
        policies: await policyRepository.findAll(),
        assignments: await policyRepository.findAllAssignments(),
        takenDays: await timeOffRepository(tx).sumDaysByType({ from: year.start, until: year.end }),
        peopleWithTimeOff: await allowanceRepository(tx).countEmployeesWithAllowanceUntil(today()),
      };
    },
  );
  return {
    timeOffTypes: types.sort(byTypeOrder).map((timeOffType) => ({
      timeOffType,
      balance: sharedBalance(countingToday(policies, assignments, timeOffType.id, today())),
      daysTakenThisYear:
        takenDays.find(({ timeOffTypeId }) => timeOffTypeId === timeOffType.id)?.days ?? 0,
    })),
    peopleWithTimeOff,
  };
}

/**
 * The type's policies as each counts today, by a version assigned today, else by its latest
 * published version; one with none published is left out.
 */
function countingToday(
  policies: readonly TimeOffPolicy[],
  assignments: readonly PolicyAssignment[],
  timeOffTypeId: string,
  date: CalendarDate,
): { id: string; balance: PolicyVersion["balance"] }[] {
  const today = new Set(
    assignments.filter((row) => coversDate(row, date)).map((row) => row.versionId),
  );
  return policies
    .filter(({ timeOffType }) => timeOffType.id === timeOffTypeId)
    .flatMap(({ id, versions }) => {
      const published = versions.filter(({ status }) => status === "published");
      const version = published.find((candidate) => today.has(candidate.id)) ?? published.at(-1);
      return version ? [{ id, balance: version.balance }] : [];
    });
}
