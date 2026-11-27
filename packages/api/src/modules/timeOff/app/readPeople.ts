import type { Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import {
  createPersonTimeline,
  type EmployeeReadService,
  type PersonTimeline,
} from "../../employees";
import {
  type Allowance,
  allowanceRepository,
  type OfferStop,
  offerStopRepository,
  type PolicyAssignment,
  timeOffPolicyRepository,
} from "../db";
import type { DatedPolicy, PolicyVersion, TimeOffPolicy } from "../domain";

/** What decides one person's allowances. */
export interface Person {
  employeeId: string;
  periods: readonly { startDate: CalendarDate | null; endDate: CalendarDate | null }[];
  serviceStart: CalendarDate | null;
  /** What decides the person's policy for one type. */
  timelineOf: (timeOffTypeId: string) => PersonTimeline<PolicyVersion>;
  allowances: readonly Allowance[];
}

/**
 * Every policy, what decides each person's allowances, and each person's stops of a type;
 * `assignments` replaces the stored assignments read, as a publish would leave them.
 */
export async function readPeople(
  employeeReads: Pick<EmployeeReadService, "readEmploymentPeriods" | "readTermsMemberships">,
  tx: Tx,
  ids: readonly string[],
  assignments?: (stored: PolicyAssignment[]) => PolicyAssignment[],
): Promise<{
  people: Person[];
  policies: TimeOffPolicy[];
  stopsOf: (employeeId: string, timeOffTypeId: string) => OfferStop[];
}> {
  const policyRepository = timeOffPolicyRepository(tx);
  const [policies, employments, memberships, existing] = await Promise.all([
    policyRepository.findAll(),
    employeeReads.readEmploymentPeriods(tx, ids),
    employeeReads.readTermsMemberships(tx, ids),
    allowanceRepository(tx).findByEmployees(ids),
  ]);
  const termsIds = [...new Set([...memberships.values()].flat().map(({ termsId }) => termsId))];
  const stored = await policyRepository.findAssignments({ employeeIds: ids, termsIds });
  const rows = Map.groupBy(assignments ? assignments(stored) : stored, laneKey);
  const stops = Map.groupBy(
    await offerStopRepository(tx).findByEmployees(ids),
    ({ employeeId, timeOffTypeId }) => `${employeeId}:${timeOffTypeId}`,
  );
  const stopsOf = (employeeId: string, typeId: string) =>
    stops.get(`${employeeId}:${typeId}`) ?? [];
  const versions = new Map(
    policies.flatMap((policy) => policy.versions.map((version) => [version.id, version])),
  );
  const existingOf = Map.groupBy(existing, ({ employeeId }) => employeeId);
  const people = ids.map((employeeId) => {
    const periods = employments.get(employeeId) ?? [];
    return {
      employeeId,
      periods,
      serviceStart: periods[0]?.startDate ?? null,
      timelineOf: (timeOffTypeId: string) =>
        createPersonTimeline({
          direct: rows.get(laneKey({ owner: { employeeId }, timeOffTypeId })) ?? [],
          stops: stopsOf(employeeId, timeOffTypeId),
          terms: memberships.get(employeeId) ?? [],
          termsAssignments: (termsId) =>
            rows.get(laneKey({ owner: { termsId }, timeOffTypeId })) ?? [],
          version: (versionId) => versions.get(versionId)!,
        }),
      allowances: existingOf.get(employeeId) ?? [],
    };
  });
  return { people, policies, stopsOf };
}

/** One owner's assignments for one type, as a key. */
export function laneKey({
  owner,
  timeOffTypeId,
}: Pick<PolicyAssignment, "owner" | "timeOffTypeId">): string {
  const ownerKey =
    "employeeId" in owner ? `employee:${owner.employeeId}` : `terms:${owner.termsId}`;
  return `${ownerKey}:${timeOffTypeId}`;
}

/** The person's policies for the allowance's type over its leave year. */
export function datedPolicies(
  person: Person,
  allowance: Pick<Allowance, "timeOffTypeId" | "leaveYearStart" | "leaveYearEnd">,
): DatedPolicy[] {
  return person
    .timelineOf(allowance.timeOffTypeId)
    .getVersions(allowance.leaveYearStart, allowance.leaveYearEnd)
    .map(({ version, startDate, endDate }) => ({
      startDate,
      endDate,
      balance: version.balance,
      bankHolidays: version.bankHolidays,
      rules: version.rules,
    }));
}
