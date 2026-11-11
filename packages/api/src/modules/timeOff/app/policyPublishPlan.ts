import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import { type CalendarDate, coversDate } from "../../../utils";
import {
  type AssignmentOwner,
  type AssignmentPlan,
  changesWithin,
  type EmployeeReadService,
  isSameOwner,
  NEW_ROW,
  firstReplaced,
  planEnd,
  planOrRefusal,
  rowsAfterPlan,
} from "../../employees";
import { type PolicyAssignment, timeOffPolicyRepository } from "../db";
import { type PolicyVersion, refuseCountsChangesMidYear, type TimeOffPolicy } from "../domain";
import { laneKey, type Person, readPeople } from "./allowanceEngine";
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
  /** Null when the owner's rows refuse the publish: publishing to them throws `refusal`. */
  plan: AssignmentPlan | null;
  refusal: unknown;
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
      ownerPlans.push({
        owner,
        lane,
        ...(version.stops
          ? stopOrRefusal(lane, isOfPolicy, from)
          : planOrRefusal(lane, isOfPolicy, from)),
        replaced: firstReplaced(lane, isOfPolicy, from),
      });
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
  for (const { owner, lane, plan, refusal } of owners) {
    if (!ticked.some((one) => isSameOwner(one, owner))) {
      continue;
    }
    if (!plan) {
      throw refusal;
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
  if (!plan) {
    return [];
  }
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
  if (version.stops) {
    return stopReach(employeeReads, tx, { candidates, typeId, from, after: people });
  }
  return people
    .filter((person) =>
      person
        .timelineOf(typeId)
        .appliesFrom((versionId) => versionId === version.id, from, person.periods),
    )
    .map(({ employeeId }) => employeeId);
}

/** The people whose rules for the type a stop would change on a day from `from` while they are employed. */
async function stopReach(
  employeeReads: EmployeeReadService,
  tx: Tx,
  {
    candidates,
    typeId,
    from,
    after,
  }: { candidates: string[]; typeId: string; from: CalendarDate; after: Person[] },
): Promise<string[]> {
  const { people: before } = await readPeople(employeeReads, tx, candidates);
  return before
    .filter((person, i) =>
      changesWithin(person.timelineOf(typeId), after[i]!.timelineOf(typeId), from, person.periods),
    )
    .map(({ employeeId }) => employeeId);
}

/**
 * How a stop from `from` ends one owner's rows of the policy: those covering `from` end the day
 * before and later ones go, adding none. Nothing to stop keeps a refusal, as `planOrRefusal` does.
 */
function stopOrRefusal(
  lane: readonly PolicyAssignment[],
  isOfPolicy: (row: PolicyAssignment) => boolean,
  from: CalendarDate,
): { plan: AssignmentPlan | null; refusal: unknown } {
  const plan = planEnd(lane, isOfPolicy, from);
  return plan
    ? { plan, refusal: null }
    : { plan: null, refusal: invalidInput([{ field: "startDate", code: "not_offered" }]) };
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

/** Refuses, with CONFLICT, unpublished versions that are not exactly the ones asked, at their revisions. */
export function refuseChangedVersions(
  asked: readonly { id: string; revision: number }[],
  current: readonly { id: string; revision: number }[],
) {
  if (current.length === 0) {
    throw new ApplicationError("CONFLICT", "These terms have nothing to publish.");
  }
  const same =
    asked.length === current.length &&
    current.every(({ id, revision }) =>
      asked.some((version) => version.id === id && version.revision === revision),
    );
  if (!same) {
    throw new ApplicationError(
      "CONFLICT",
      "The unpublished changes on these terms changed since you opened them.",
    );
  }
}

/** Refuses an owner Publish does not suggest as invalid input. */
export function refuseUnsuggestedOwners(
  owners: readonly AssignmentOwner[],
  suggested: readonly AssignmentOwner[],
) {
  if (owners.some((owner) => !suggested.some((known) => isSameOwner(known, owner)))) {
    throw invalidInput([{ field: "owners", code: "not_using_policy" }]);
  }
}
