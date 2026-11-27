import type { Tx } from "../../../core/db";
import { type OwnStretch, ownStretchesOf } from "../../employees";
import { offerStopRepository, timeOffPolicyRepository } from "../db";
import type { NewPolicyVersion } from "../domain";
import { versionOf } from "./policyRules";

/** One person's assignments for one type. */
export interface OwnRulesLane {
  employeeId: string;
  timeOffTypeId: string;
}

/** What a person's own stretch gives for a type: their own rules, or not offering it. */
export type OwnRules = NewPolicyVersion | typeof NOT_OFFERED;

/** An own stretch that stops offering the type over the person's terms. */
export const NOT_OFFERED = "not_offered";

/** A version the person's own rules use: its rules, and the ids an assignment to it needs. */
export type OwnRulesVersion = NewPolicyVersion & { id: string; timeOffPolicyId: string };

/** A person's own rules and stops for a type from their rows, and the versions those use. */
export async function readOwnRules(
  tx: Tx,
  { employeeId, timeOffTypeId }: OwnRulesLane,
): Promise<{ stretches: OwnStretch<OwnRules>[]; versions: OwnRulesVersion[] }> {
  const repository = timeOffPolicyRepository(tx);
  const policies = await repository.findAll();
  const rows = (await repository.findAssignments({ employeeIds: [employeeId] })).filter(
    (row) => row.timeOffTypeId === timeOffTypeId,
  );
  const stops = (await offerStopRepository(tx).findByEmployees([employeeId]))
    .filter((stop) => stop.timeOffTypeId === timeOffTypeId)
    .map(({ id, startDate, endDate }) => ({
      id,
      owner: { employeeId },
      versionId: NOT_OFFERED,
      startDate,
      endDate,
    }));
  return {
    stretches: ownStretchesOf<OwnRules>([...rows, ...stops], (id) =>
      id === NOT_OFFERED ? NOT_OFFERED : versionOf(policies, id),
    ),
    versions: rows.map(({ versionId }) => versionOf(policies, versionId)),
  };
}

/**
 * Gives the person one row per own stretch for the type, in place of the ones they had: a stop, or
 * an assignment to a version they already use with the same rules, else to a new published one
 * under their own policy for the type. Returns that policy's id; null when they have none.
 */
export async function saveOwnRules(
  tx: Tx,
  { employeeId, timeOffTypeId }: OwnRulesLane,
  versions: readonly OwnRulesVersion[],
  stretches: readonly OwnStretch<OwnRules>[],
): Promise<string | null> {
  const repository = timeOffPolicyRepository(tx);
  const owned = [
    ...(await repository.findAssignments({ employeeIds: [employeeId] })),
    ...(await offerStopRepository(tx).findByEmployees([employeeId])),
  ];
  for (const { id } of owned.filter((row) => row.timeOffTypeId === timeOffTypeId)) {
    await repository.deleteAssignment(id);
  }
  const saved = [...versions];
  let timeOffPolicyId = saved[0]?.timeOffPolicyId;
  for (const { startDate, endDate, value } of stretches) {
    if (value === NOT_OFFERED) {
      await offerStopRepository(tx).insert({ employeeId, timeOffTypeId, startDate, endDate });
      continue;
    }
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
  return timeOffPolicyId ?? null;
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
