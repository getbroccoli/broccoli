import type { Tx } from "../../../core/db";
import { addDays, type CalendarDate, coversDate } from "../../../utils";
import { makeRoomForDatedRow } from "../../employees";
import { timeOffPolicyRepository } from "../db";
import {
  refuseCountsChangeMidYear,
  type TimeOffPolicy,
  type TimeOffRules,
  versionFromRules,
} from "../domain";

/**
 * Adds the rules' version from `startDate`: the version covering it ends the day before and the new
 * one runs to that version's end, or to the next version; one starting on the date is replaced.
 */
export async function addVersionFrom(
  tx: Tx,
  policy: TimeOffPolicy,
  startDate: CalendarDate,
  rules: TimeOffRules,
) {
  const repository = timeOffPolicyRepository(tx);
  const before = policy.versions.find((version) => coversDate(version, startDate)) ?? null;
  const next =
    policy.versions.find(({ startDate: from }) => from !== null && from > startDate) ?? null;
  refuseCountsChangeMidYear(rules, startDate, { before, next });
  const endDate = before ? before.endDate : next && addDays(next.startDate!, -1);
  const { ended, replaced } = makeRoomForDatedRow(policy.versions, startDate, endDate);
  if (replaced) {
    await repository.deleteVersion(replaced.id);
  }
  if (ended) {
    await repository.endVersion(ended.id, addDays(startDate, -1));
  }
  const version = { ...versionFromRules(rules, before), startDate, endDate };
  await repository.insertVersion(policy.id, version);
  return { before, version };
}
