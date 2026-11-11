import type { Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import { coversDate } from "../../../utils";
import {
  type AssignmentOwner,
  type AssignmentPlan,
  type EmployeeReadService,
  isSameOwner,
  NEW_ROW,
  planReplacement,
  rowsAfterPlan,
} from "../../employees";
import { type PolicyAssignment, timeOffPolicyRepository } from "../db";
import { type PolicyVersion, refuseCountsChangesMidYear, type TimeOffPolicy } from "../domain";
import { laneKey, readPeople } from "./allowanceEngine";

/** What publishing one of a set of terms' unpublished policy versions from a date would do. */
export interface PolicyPublish {
  version: PolicyVersion;
  policy: TimeOffPolicy;
  /** These terms first, then every owner with an assignment of the version they have on the date. */
  owners: OwnerPlan[];
}

/** How one owner's rows for the type would change, and the row the new version takes over on the date. */
export interface OwnerPlan {
  owner: AssignmentOwner;
  lane: PolicyAssignment[];
  plan: AssignmentPlan;
  replaced: PolicyAssignment | null;
}

/**
 * Each unpublished policy version of the terms, with what publishing it from `from` would do to
 * every owner it reaches; refuses one that would change how its type counts mid leave year.
 */
export async function planPolicies(
  tx: Tx,
  termsId: string,
  from: CalendarDate,
): Promise<PolicyPublish[]> {
  const repository = timeOffPolicyRepository(tx);
  const policies = await repository.findAll();
  const versions = new Map(policies.flatMap(({ versions: all }) => all.map((v) => [v.id, v])));
  const plans: PolicyPublish[] = [];
  for (const policy of policies) {
    const version = policy.versions.find((v) => v.status === "draft" && v.termsId === termsId);
    if (!version) {
      continue;
    }
    const typeId = policy.timeOffType.id;
    const termsLane = await laneOf(tx, { termsId }, typeId);
    const source = termsLane.find((row) => coversDate(row, from))?.versionId ?? null;
    const owners: AssignmentOwner[] = [{ termsId }];
    const sharing = (await repository.findAssignmentsOfVersions(source ? [source] : [])).filter(
      (row) => coversDate(row, from) || row.startDate > from,
    );
    for (const { owner } of sharing) {
      if (!owners.some((known) => isSameOwner(known, owner))) owners.push(owner);
    }
    const ownerPlans: OwnerPlan[] = [];
    for (const owner of owners) {
      const lane = await laneOf(tx, owner, typeId);
      const plan = planReplacement(lane, source, from);
      refuseCountsChangesMidYear(
        rowsAfterPlan(lane, plan, { versionId: version.id, owner }).map((row) => ({
          ...row,
          balance: (row.versionId === version.id ? version : versions.get(row.versionId)!).balance,
        })),
        (row) => row.id === NEW_ROW,
      );
      const replaced = lane.find((row) => row.versionId === source && coversDate(row, from));
      ownerPlans.push({ owner, lane, plan, replaced: replaced ?? null });
    }
    plans.push({ version, policy, owners: ownerPlans });
  }
  return plans;
}

/** The employees on whom the version would apply on some day from `from` on that they are employed. */
export async function readPolicyReach(
  employeeReads: EmployeeReadService,
  tx: Tx,
  { version, policy }: PolicyPublish,
  { owner, plan, lane }: OwnerPlan,
  from: CalendarDate,
): Promise<string[]> {
  const candidates =
    "employeeId" in owner
      ? [owner.employeeId]
      : ((await employeeReads.readTermsMemberIds(tx, owner.termsId)) ?? []);
  const typeId = policy.timeOffType.id;
  const after = rowsAfterPlan(lane, plan, { versionId: version.id, owner }).map((row) => ({
    ...row,
    timeOffTypeId: typeId,
    timeOffPolicyId: policy.id,
  }));
  const key = laneKey({ owner, timeOffTypeId: typeId });
  const { people } = await readPeople(employeeReads, tx, candidates, (stored) => [
    ...stored.filter((row) => laneKey(row) !== key),
    ...after,
  ]);
  return people
    .filter((person) =>
      person
        .timelineOf(typeId)
        .appliesFrom((versionId) => versionId === version.id, from, person.periods),
    )
    .map(({ employeeId }) => employeeId);
}

/** One owner's assignments for one type, oldest first. */
async function laneOf(
  tx: Tx,
  owner: AssignmentOwner,
  timeOffTypeId: string,
): Promise<PolicyAssignment[]> {
  const rows = await timeOffPolicyRepository(tx).findAssignments(
    "employeeId" in owner ? { employeeIds: [owner.employeeId] } : { termsIds: [owner.termsId] },
  );
  return rows.filter((row) => row.timeOffTypeId === timeOffTypeId);
}
