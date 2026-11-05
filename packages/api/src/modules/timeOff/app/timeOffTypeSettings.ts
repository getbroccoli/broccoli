import type { Transact, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid } from "../../../utils";
import { allowanceRepository, timeOffPolicyRepository, timeOffRepository } from "../db";
import { isReasonAlwaysPrivate, policyIdOn, type TimeOffPolicy, type TimeOffType } from "../domain";
import type { EmployeeReadService } from "../../employees";
import { readTimelines } from "./allowanceEngine";
import { byTypeOrder, calendarYearOf, overlaps } from "./readTimeOffTypes";

/** A policy as Settings shows it: its rules and who it applies to today. */
export interface TimeOffPolicySettings {
  id: string;
  name: string;
  /** One of the standard leave policies, found by its key. */
  standard: boolean;
  balance: TimeOffPolicy["balance"];
  /** Null unless it counts from a balance. */
  allowance: {
    days: number;
    daysPerWeek: number;
    maxDays: number | null;
    bankHolidays: NonNullable<TimeOffPolicy["bankHolidays"]>;
  } | null;
  leaveYear: TimeOffPolicy["leaveYear"];
  /** The terms it is linked to today. */
  terms: { id: string; name: string }[];
  /** The employees it applies to today, through their terms or their own assignment. */
  peopleCount: number;
  /** Those of them on it only through their own assignment, not their terms. */
  ownAssignmentCount: number;
  /** Ever linked to terms or assigned to someone; how it counts can then no longer change. */
  everUsed: boolean;
}

/** A time off type as Settings shows it. */
export interface TimeOffTypeSettings {
  timeOffType: TimeOffType;
  /** In use by people count, most first, then unused ones by name. */
  policies: TimeOffPolicySettings[];
  /** Everyone's approved or pending days in the calendar year of today; a half day is 0.5. */
  daysTakenThisYear: number;
  /** Not seeded, and nobody has ever had it. */
  canDelete: boolean;
  /** Colleagues never see the reason, whatever the type's setting: Sickness. */
  reasonAlwaysPrivate: boolean;
}

/** Every time off type as Settings lists it, and how many people have time off. */
export interface TimeOffTypeList {
  timeOffTypes: TimeOffTypeSettings[];
  /** People with an allowance whose leave year has not ended. */
  peopleWithTimeOff: number;
}

export type TimeOffTypeSettingsDependencies = {
  transact: Transact;
  employeeReads: Pick<
    EmployeeReadService,
    "readEmploymentPeriods" | "readTermsMemberships" | "readTerms"
  >;
  today: () => CalendarDate;
};

/** Every time off type in list order, with its policies and the days taken this year. */
export async function listTimeOffTypes(
  dependencies: TimeOffTypeSettingsDependencies,
  ctx: SecurityContext,
): Promise<TimeOffTypeList> {
  ctx.require("MANAGE_WORKSPACE");
  return dependencies.transact(async (tx) => {
    const types = await timeOffPolicyRepository(tx).findAllTypes();
    return {
      timeOffTypes: await readTypeSettings(dependencies, tx, types.sort(byTypeOrder)),
      peopleWithTimeOff: await allowanceRepository(tx).countEmployeesWithAllowanceUntil(
        dependencies.today(),
      ),
    };
  });
}

/** One time off type with its policies; null when no type has this id. */
export async function readTimeOffTypeSettings(
  dependencies: TimeOffTypeSettingsDependencies,
  ctx: SecurityContext,
  input: { id: string },
): Promise<TimeOffTypeSettings | null> {
  ctx.require("MANAGE_WORKSPACE");
  const id = parseUuid(input.id);
  if (!id) {
    return null;
  }
  return dependencies.transact(async (tx) => readOneTypeSettings(dependencies, tx, id));
}

/** One time off type with its policies inside the caller's transaction; null when there is none. */
export async function readOneTypeSettings(
  dependencies: TimeOffTypeSettingsDependencies,
  tx: Tx,
  timeOffTypeId: string,
): Promise<TimeOffTypeSettings | null> {
  const types = await timeOffPolicyRepository(tx).findAllTypes();
  const type = types.find(({ id }) => id === timeOffTypeId);
  return type ? (await readTypeSettings(dependencies, tx, [type]))[0]! : null;
}

async function readTypeSettings(
  dependencies: TimeOffTypeSettingsDependencies,
  tx: Tx,
  types: readonly TimeOffType[],
): Promise<TimeOffTypeSettings[]> {
  const year = calendarYearOf(dependencies.today());
  const typeIds = new Set(types.map(({ id }) => id));
  const policies = (await timeOffPolicyRepository(tx).findAll()).filter(({ timeOffType }) =>
    typeIds.has(timeOffType.id),
  );
  const [policySettings, takenDays, withAllowances, withTimeOff] = await Promise.all([
    readPolicySettings(dependencies, tx, policies),
    timeOffRepository(tx).sumDaysByType({ from: year.start, until: year.end }),
    allowanceRepository(tx).findTypeIdsWithAllowances(),
    timeOffRepository(tx).findTypeIdsWithTimeOff(),
  ]);
  return types.map((timeOffType) => {
    const ofType = policySettings.filter(
      (_settings, index) => policies[index]!.timeOffType.id === timeOffType.id,
    );
    return {
      timeOffType,
      policies: byUse(ofType),
      daysTakenThisYear:
        takenDays.find(({ timeOffTypeId }) => timeOffTypeId === timeOffType.id)?.days ?? 0,
      reasonAlwaysPrivate: isReasonAlwaysPrivate(timeOffType),
      canDelete:
        timeOffType.typeKey === null &&
        !ofType.some(({ everUsed }) => everUsed) &&
        !withAllowances.has(timeOffType.id) &&
        !withTimeOff.has(timeOffType.id),
    };
  });
}

/** Each policy's settings, in the order of `policies`. */
async function readPolicySettings(
  { employeeReads, today }: TimeOffTypeSettingsDependencies,
  tx: Tx,
  policies: readonly TimeOffPolicy[],
): Promise<TimeOffPolicySettings[]> {
  const repository = timeOffPolicyRepository(tx);
  const policyIds = policies.map(({ id }) => id);
  const [links, assignments] = await Promise.all([
    repository.findLinksOfPolicies(policyIds),
    repository.findAssignmentsOfPolicies(policyIds),
  ]);
  const terms = await employeeReads.readTerms(tx, [
    ...new Set(links.map(({ termsId }) => termsId)),
  ]);
  const candidateIds = new Set([
    ...terms.flatMap(({ memberIds }) => memberIds),
    ...assignments.map(({ employeeId }) => employeeId),
  ]);
  const date = today();
  const people = await readTimelines(employeeReads, tx, [...candidateIds]);
  const employedToday = people.filter(({ periods }) =>
    periods.some((period) => overlaps(period, { start: date, end: date })),
  );
  return policies.map((policy) => {
    const typeId = policy.timeOffType.id;
    const onIt = employedToday.filter(
      ({ timeline }) => policyIdOn(timeline, typeId, date) === policy.id,
    );
    const linkedToday = links.filter(
      (link) => link.timeOffPolicyId === policy.id && covers(link, date),
    );
    return {
      ...rulesOf(policy),
      terms: terms
        .filter(({ id }) => linkedToday.some(({ termsId }) => termsId === id))
        .map(({ id, name }) => ({ id, name })),
      peopleCount: onIt.length,
      ownAssignmentCount: onIt.filter(
        ({ timeline }) => policyIdOn({ ...timeline, assignments: [] }, typeId, date) !== policy.id,
      ).length,
      everUsed:
        links.some(({ timeOffPolicyId }) => timeOffPolicyId === policy.id) ||
        assignments.some(({ timeOffPolicyId }) => timeOffPolicyId === policy.id),
    };
  });
}

function rulesOf(
  policy: TimeOffPolicy,
): Pick<TimeOffPolicySettings, "id" | "name" | "standard" | "balance" | "allowance" | "leaveYear"> {
  const yearly = policy.rules.find((rule) => rule.kind === "yearly_entitlement");
  return {
    id: policy.id,
    name: policy.name,
    standard: policy.key !== null,
    balance: policy.balance,
    allowance:
      yearly && policy.bankHolidays
        ? {
            days: yearly.entitlementDays,
            daysPerWeek: yearly.entitlementDaysPerWeek,
            maxDays: yearly.maxDays,
            bankHolidays: policy.bankHolidays,
          }
        : null,
    leaveYear: policy.leaveYear,
  };
}

/** Policies in use first, most people first; the rest keep their order by name. */
function byUse(policies: readonly TimeOffPolicySettings[]): TimeOffPolicySettings[] {
  return policies.toSorted((a, b) => b.peopleCount - a.peopleCount);
}

function covers(
  row: { effectiveFrom: CalendarDate | null; effectiveUntil: CalendarDate | null },
  date: CalendarDate,
): boolean {
  return overlaps(
    { startDate: row.effectiveFrom, endDate: row.effectiveUntil },
    { start: date, end: date },
  );
}
