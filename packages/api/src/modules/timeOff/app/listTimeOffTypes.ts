import type { Transact } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import type { EmployeeReadService } from "../../employees";
import { timeOffPolicyRepository, timeOffRepository } from "../db";
import type { TimeOffPolicy, TimeOffType } from "../domain";
import type { AllowanceEngineDependencies } from "./allowanceEngine";
import { byTypeOrder, calendarYearOf, readTimeOffTypes } from "./readTimeOffTypes";

/** Every time off type as Settings lists it, and how many people have one today. */
export interface TimeOffTypeList {
  timeOffTypes: {
    timeOffType: TimeOffType;
    /** The kind most of its policies share, the oldest policy's on a tie; null with no policy. */
    balance: TimeOffPolicy["balance"] | null;
    /** Everyone's approved or pending days in the calendar year of today; a half day is 0.5. */
    daysTakenThisYear: number;
  }[];
  /** People whose panel shows at least one time off type today. */
  peopleWithTimeOff: number;
}

type Dependencies = {
  transact: Transact;
  employeeReads: AllowanceEngineDependencies["employeeReads"] &
    Pick<EmployeeReadService, "listEmployees">;
  today: AllowanceEngineDependencies["today"];
};

const PAGE_SIZE = 100;

/** Every time off type in list order, with how it counts and the days taken this year. */
export async function listTimeOffTypes(
  dependencies: Dependencies,
  ctx: SecurityContext,
): Promise<TimeOffTypeList> {
  ctx.require("MANAGE_WORKSPACE");
  const year = calendarYearOf(dependencies.today());
  const { types, policies, takenDays } = await dependencies.transact(async (tx) => {
    const policyRepository = timeOffPolicyRepository(tx);
    return {
      types: await policyRepository.findAllTypes(),
      policies: await policyRepository.findAll(),
      takenDays: await timeOffRepository(tx).sumDaysByType({ from: year.start, until: year.end }),
    };
  });
  return {
    timeOffTypes: types.sort(byTypeOrder).map((timeOffType) => ({
      timeOffType,
      balance: sharedBalance(policies.filter((policy) => policy.timeOffType.id === timeOffType.id)),
      daysTakenThisYear:
        takenDays.find(({ timeOffTypeId }) => timeOffTypeId === timeOffType.id)?.days ?? 0,
    })),
    peopleWithTimeOff: await countPeopleWithTimeOff(dependencies, ctx),
  };
}

/** The balance kind most policies share; ties go to the oldest policy, whose uuidv7 id sorts first. */
function sharedBalance(policies: readonly TimeOffPolicy[]): TimeOffPolicy["balance"] | null {
  const oldestFirst = [...policies].sort((a, b) => a.id.localeCompare(b.id));
  const countOf = (balance: TimeOffPolicy["balance"]) =>
    policies.filter((policy) => policy.balance === balance).length;
  return oldestFirst.reduce<TimeOffPolicy["balance"] | null>(
    (best, { balance }) => (best === null || countOf(balance) > countOf(best) ? balance : best),
    null,
  );
}

// shortcut: reads every employee's figures page by page; fine for SMB sizes, add a counting query if it gets slow.
async function countPeopleWithTimeOff(
  dependencies: Dependencies,
  ctx: SecurityContext,
): Promise<number> {
  let count = 0;
  let after: string | null = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const page = await dependencies.employeeReads.listEmployees(ctx, { first: PAGE_SIZE, after });
    const types = await readTimeOffTypes(dependencies, ctx, {
      employeeIds: page.edges.map(({ node }) => node.id),
    });
    count += [...types.values()].filter((rows) => rows.length > 0).length;
    ({ endCursor: after, hasNextPage } = page.pageInfo);
  }
  return count;
}
