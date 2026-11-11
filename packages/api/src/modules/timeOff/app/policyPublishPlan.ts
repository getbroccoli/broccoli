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
import { ownerIds } from "./policyRules";

/** What publishing one of a set of terms' unpublished policy versions from a date would do. */
export interface PolicyPublish {
  version: PolicyVersion;
  policy: TimeOffPolicy;
  /** These terms first, then every owner with an assignment of the policy covering the date or later. */
  owners: OwnerPlan[];
}

/** How one owner's rows for the type would change, and the row the new version takes over on the date. */
export interface OwnerPlan {
  owner: AssignmentOwner;
  lane: PolicyAssignment[];
  plan: AssignmentPlan;
  replaced: PolicyAssignment | null;
}

/** Each unpublished policy version of the terms, with what publishing it from `from` would do to every owner it reaches. */
export async function planPolicies(
  tx: Tx,
  termsId: string,
  from: CalendarDate,
): Promise<PolicyPublish[]> {
  const repository = timeOffPolicyRepository(tx);
  const policies = await repository.findAll();
  const plans: PolicyPublish[] = [];
  for (const policy of policies) {
    const version = policy.versions.find((v) => v.status === "draft" && v.termsId === termsId);
    if (!version) {
      continue;
    }
    const typeId = policy.timeOffType.id;
    const isOfPolicy = (row: PolicyAssignment) => row.timeOffPolicyId === policy.id;
    const owners: AssignmentOwner[] = [{ termsId }];
    const published = policy.versions.filter(({ status }) => status === "published");
    const sharing = (
      await repository.findAssignmentsOfVersions(published.map(({ id }) => id))
    ).filter((row) => coversDate(row, from) || row.startDate > from);
    for (const { owner } of sharing) {
      if (!owners.some((known) => isSameOwner(known, owner))) owners.push(owner);
    }
    const ownerPlans: OwnerPlan[] = [];
    for (const owner of owners) {
      const lane = await laneOf(tx, owner, typeId);
      const plan = planReplacement(lane, isOfPolicy, from);
      const replaced = lane.find((row) => isOfPolicy(row) && coversDate(row, from));
      ownerPlans.push({ owner, lane, plan, replaced: replaced ?? null });
    }
    plans.push({ version, policy, owners: ownerPlans });
  }
  return plans;
}

/**
 * Refuses publishing `publish` to the `ticked` owners when a row it adds, or the one it follows on
 * from or leads into, would change how the type counts partway through a leave year; `policies`
 * give every neighbouring row its rules, whichever policy it belongs to.
 */
export function refuseCountsChangesOf(
  { version, owners }: PolicyPublish,
  ticked: readonly AssignmentOwner[],
  policies: readonly TimeOffPolicy[],
) {
  const balances = new Map(
    policies.flatMap(({ versions }) => versions.map(({ id, balance }) => [id, balance])),
  );
  for (const { owner, lane, plan } of owners) {
    if (!ticked.some((one) => isSameOwner(one, owner))) {
      continue;
    }
    refuseCountsChangesMidYear(
      rowsAfterPlan(lane, plan, { versionId: version.id, owner }).map((row) => ({
        ...row,
        balance: balances.get(row.versionId)!,
      })),
      (row) => row.id === NEW_ROW,
    );
  }
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
  const rows = await timeOffPolicyRepository(tx).findAssignments(ownerIds(owner));
  return rows.filter((row) => row.timeOffTypeId === timeOffTypeId);
}
