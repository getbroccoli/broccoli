import type { Tx } from "../../../../core/db";
import { type CalendarDate, coversDate } from "../../../../utils";
import { employmentRepository, termsRepository, workingPatternRepository } from "../../db";
import {
  type Assignment,
  type AssignmentOwner,
  type AssignmentPlan,
  isSameOwner,
  type PatternVersion,
  planReplacement,
  rowsAfterPlan,
} from "../../domain";
import { readTimelines } from "./employeeWorkingPatternService";

/**
 * The owners publishing `draft` from `from` reaches, these terms first: the terms, and every owner
 * with an assignment of the draft's pattern that covers `from` or starts later; each with how its
 * rows would change and the row the draft takes over on `from`.
 */
export async function ownersOf(
  tx: Tx,
  termsId: string,
  draft: PatternVersion,
  versions: readonly PatternVersion[],
  from: CalendarDate,
) {
  const repository = workingPatternRepository(tx);
  const ofPattern = new Set(
    versions
      .filter(
        ({ workingPatternId, status }) =>
          workingPatternId === draft.workingPatternId && status === "published",
      )
      .map(({ id }) => id),
  );
  const isOfPattern = (row: Assignment) => ofPattern.has(row.versionId);
  const sharing = (await repository.findAssignmentsOfVersions([...ofPattern])).filter(
    (row) => coversDate(row, from) || row.startDate > from,
  );
  const owners: AssignmentOwner[] = [{ termsId }];
  for (const { owner } of sharing) {
    if (!owners.some((known) => isSameOwner(known, owner))) owners.push(owner);
  }
  const planned = [];
  for (const owner of owners) {
    const lane = await repository.findAssignments(ownerIds(owner));
    planned.push({
      owner,
      lane,
      plan: planReplacement(lane, isOfPattern, from),
      replaced: lane.find((row) => isOfPattern(row) && coversDate(row, from)) ?? null,
    });
  }
  return planned;
}

/** The employees on whom the draft would apply on some day from `from` on that they are employed. */
export async function readReach(
  tx: Tx,
  owner: AssignmentOwner,
  lane: readonly Assignment[],
  plan: AssignmentPlan,
  draftId: string,
  from: CalendarDate,
): Promise<string[]> {
  const candidates = await employeesOf(tx, owner);
  const after = rowsAfterPlan(lane, plan, { versionId: draftId, owner });
  const { timelines } = await readTimelines(tx, candidates, undefined, (stored) => [
    ...stored.filter((row) => !isSameOwner(row.owner, owner)),
    ...after,
  ]);
  const periods = await employmentRepository(tx).findPeriods(candidates);
  return candidates.filter((id) =>
    timelines
      .get(id)!
      .appliesFrom((versionId) => versionId === draftId, from, periods.get(id) ?? []),
  );
}

/** The employees an owner's working week applies to: the person, or everyone ever on the terms. */
export async function employeesOf(tx: Tx, owner: AssignmentOwner): Promise<string[]> {
  if ("employeeId" in owner) {
    return [owner.employeeId];
  }
  return (await termsRepository(tx).findMemberIds([owner.termsId])).get(owner.termsId) ?? [];
}

export function ownerIds(owner: AssignmentOwner) {
  return "employeeId" in owner
    ? { employeeIds: [owner.employeeId] }
    : { termsIds: [owner.termsId] };
}

/** Writes one owner's plan through `repository`, adding each new span with `insert`. */
export async function applyAssignmentPlan(
  repository: {
    deleteAssignment: (id: string) => Promise<void>;
    endAssignment: (id: string, endDate: CalendarDate) => Promise<void>;
  },
  plan: AssignmentPlan,
  insert: (span: AssignmentPlan["added"][number]) => Promise<unknown>,
): Promise<void> {
  for (const id of plan.deletedIds) await repository.deleteAssignment(id);
  for (const { id, endDate } of plan.ended) await repository.endAssignment(id, endDate);
  for (const span of plan.added) await insert(span);
}
