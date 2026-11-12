import type { Tx } from "../../../core/db";
import { addDays } from "../../../utils";
import { type OwnStretch, ownStretchesOf } from "../../employees";
import { timeOffPolicyRepository } from "../db";
import type { NewPolicyVersion } from "../domain";
import { versionOf } from "./policyRules";

/** One person's assignments for one type. */
export interface OwnRulesLane {
  employeeId: string;
  timeOffTypeId: string;
}

/** A version the person's own rules use: its rules, and the ids an assignment to it needs. */
export type OwnRulesVersion = NewPolicyVersion & { id: string; timeOffPolicyId: string };

/** A person's own rules for a type from their assignments, and the versions those use. */
export async function readOwnRules(
  tx: Tx,
  { employeeId, timeOffTypeId }: OwnRulesLane,
): Promise<{ stretches: OwnStretch<NewPolicyVersion>[]; versions: OwnRulesVersion[] }> {
  const repository = timeOffPolicyRepository(tx);
  const policies = await repository.findAll();
  const rows = (await repository.findAssignments({ employeeIds: [employeeId] })).filter(
    (row) => row.timeOffTypeId === timeOffTypeId,
  );
  return {
    stretches: ownStretchesOf(rows, (id) => versionOf(policies, id)),
    versions: rows.map(({ versionId }) => versionOf(policies, versionId)),
  };
}

/**
 * Gives the person one assignment per own stretch for the type, in place of the ones they had: to
 * a version they already use with the same rules, else to a new published one under their own
 * policy for the type. Returns that policy's id.
 */
export async function saveOwnRules(
  tx: Tx,
  { employeeId, timeOffTypeId }: OwnRulesLane,
  versions: readonly OwnRulesVersion[],
  stretches: readonly OwnStretch<NewPolicyVersion>[],
): Promise<string> {
  const repository = timeOffPolicyRepository(tx);
  for (const { id, timeOffTypeId: typeId } of await repository.findAssignments({
    employeeIds: [employeeId],
  })) {
    if (typeId === timeOffTypeId) await repository.deleteAssignment(id);
  }
  const saved = [...versions];
  let timeOffPolicyId = saved[0]?.timeOffPolicyId;
  for (const { startDate, endDate, value } of joinSameRules(stretches)) {
    let version = saved.find((candidate) => isSameRules(candidate, value));
    if (!version) {
      timeOffPolicyId ??= await repository.insertPolicy({ timeOffTypeId });
      const id = await repository.insertVersion(timeOffPolicyId, { ...value, status: "published" });
      version = { ...value, id, timeOffPolicyId };
      saved.push(version);
    }
    await repository.insertAssignment({
      owner: { employeeId },
      versionId: version.id,
      timeOffPolicyId: version.timeOffPolicyId,
      timeOffTypeId,
      startDate,
      endDate,
    });
  }
  return timeOffPolicyId!;
}

/** The stretches with each one that carries on the one before with the same rules joined to it. */
function joinSameRules(stretches: readonly OwnStretch<NewPolicyVersion>[]) {
  const joined: OwnStretch<NewPolicyVersion>[] = [];
  for (const stretch of stretches) {
    const last = joined.at(-1);
    if (
      last?.endDate === addDays(stretch.startDate, -1) &&
      isSameRules(last.value, stretch.value)
    ) {
      joined[joined.length - 1] = { ...last, endDate: stretch.endDate };
    } else {
      joined.push(stretch);
    }
  }
  return joined;
}

function isSameRules(a: NewPolicyVersion, b: NewPolicyVersion): boolean {
  return JSON.stringify(rulesKey(a)) === JSON.stringify(rulesKey(b));
}

/** What makes two versions' rules the same, without their ids. */
function rulesKey({ balance, bankHolidays, leaveYear, rules }: NewPolicyVersion) {
  return {
    balance,
    bankHolidays,
    leaveYear,
    // Stored rules carry ids, new ones not; JSON leaves an undefined id out.
    rules: rules.map((rule) => ({ ...rule, id: undefined })),
  };
}
