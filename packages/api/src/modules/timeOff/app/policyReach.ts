import type { Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import { createPersonTimeline, type Employee, type EmployeeReadService } from "../../employees";
import { timeOffPolicyRepository } from "../db";
import type { TimeOffPolicy } from "../domain";
import { ownPoliciesOf, readPeople } from "./allowanceEngine";

/** The people the policy applies to on some day from `from` on that they are employed, by name. */
export async function readPolicyReach(
  employeeReads: EmployeeReadService,
  tx: Tx,
  policy: TimeOffPolicy,
  from: CalendarDate,
): Promise<Employee[]> {
  const repository = timeOffPolicyRepository(tx);
  const candidates = new Set(await repository.findAssignedEmployees(policy.id));
  for (const id of policy.termsId
    ? ((await employeeReads.readTermsMemberIds(tx, policy.termsId)) ?? [])
    : []) {
    candidates.add(id);
  }
  const { people } = await readPeople(employeeReads, tx, [...candidates]);
  return employeeReads.readEmployeesByName(
    tx,
    people
      .filter((person) =>
        person.timelineOf(policy.timeOffType.id).appliesFrom(policy.id, from, person.periods),
      )
      .map(({ employeeId }) => employeeId),
  );
}

/**
 * The people an offer of the type to the terms from `from` would reach: on the terms on some day
 * from then on that they are employed and have no policy of their own for the type.
 */
export async function readOfferReach(
  employeeReads: EmployeeReadService,
  tx: Tx,
  termsId: string,
  timeOffTypeId: string,
  from: CalendarDate,
): Promise<Employee[]> {
  const memberIds = (await employeeReads.readTermsMemberIds(tx, termsId)) ?? [];
  const memberships = await employeeReads.readTermsMemberships(tx, memberIds);
  const periods = await employeeReads.readEmploymentPeriods(tx, memberIds);
  const assignments = await timeOffPolicyRepository(tx).findAssignments(memberIds);
  const reached = memberIds.filter((employeeId) =>
    createPersonTimeline({
      direct: ownPoliciesOf(assignments.get(employeeId) ?? [], timeOffTypeId),
      terms: memberships.get(employeeId) ?? [],
      idOfTerms: (id) => (id === termsId ? OFFER : null),
      versions: () => [],
    }).appliesFrom(OFFER, from, periods.get(employeeId) ?? []),
  );
  return employeeReads.readEmployeesByName(tx, reached);
}

/** Stands for the policy an offer would create, which has no id yet. */
const OFFER = "offer";
