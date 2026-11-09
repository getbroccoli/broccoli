import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import { createRecordHistoryService } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, coversDate, parseUuid } from "../../../utils";
import { type Employee, makeRoomForDatedRow } from "../../employees";
import { timeOffPolicyRepository, timeOffRepository } from "../db";
import {
  type PolicyVersion,
  refuseCountsChangeMidYear,
  type TimeOffPolicy,
  type TimeOffRules,
  type TimeOffType,
  versionFromRules,
} from "../domain";

/** The steps the time off policy service's changes share: versions, a stop, history, lookups. */

const recordHistory = createRecordHistoryService();

/**
 * Ends the policy the day before `stopDate` and deletes its later versions; returns the version
 * that ends. INVALID_INPUT when no version covers the day before; CONFLICT while one of `reached`
 * has time off of the type booked from `stopDate`.
 */
export async function endPolicyFrom(
  tx: Tx,
  policy: TimeOffPolicy,
  stopDate: CalendarDate,
  reached: readonly Employee[],
): Promise<PolicyVersion> {
  const repository = timeOffPolicyRepository(tx);
  const lastDay = addDays(stopDate, -1);
  const stopped = policy.versions.find((version) => coversDate(version, lastDay));
  if (!stopped) {
    throw invalidInput([{ field: "stopDate", code: "before_offer" }]);
  }
  // shortcut: counts booked days from the stop on, even while a person is on other terms; narrow to their days on these terms if that refuses real stops.
  const booked = await timeOffRepository(tx).findPeopleWithTimeOffFrom({
    employeeIds: reached.map(({ id }) => id),
    timeOffTypeId: policy.timeOffType.id,
    from: stopDate,
  });
  if (booked.length > 0) {
    throw new ApplicationError("CONFLICT", bookedMessage(booked.length));
  }
  for (const version of policy.versions) {
    if (version.startDate !== null && version.startDate >= stopDate) {
      await repository.deleteVersion(version.id);
    }
  }
  await repository.endVersion(stopped.id, lastDay);
  return stopped;
}

/** The last version, when a stop from `stopDate`, after today, ends it; null otherwise. */
export function plannedStop(
  versions: readonly PolicyVersion[],
  stopDate: string,
  today: CalendarDate,
): PolicyVersion | null {
  const last = versions.at(-1);
  return last?.endDate && stopDate > today && addDays(last.endDate, 1) === stopDate ? last : null;
}

/** A stop as history keeps it: a JSON object with its date. */
export function stopValue(stopDate: string): string {
  return JSON.stringify({ stopDate });
}

function bookedMessage(count: number): string {
  return count === 1
    ? "1 person has this time off type booked from that date."
    : `${count} people have this time off type booked from that date.`;
}

/**
 * On a terms' policy, the line in the terms' history: the values before and after, rules or a
 * stop; null for none.
 */
export async function appendTermsHistory(
  ctx: SecurityContext,
  tx: Tx,
  policy: { termsId: string | null; timeOffType: TimeOffType },
  oldValue: string | null,
  newValue: string | null,
) {
  if (!policy.termsId) {
    return;
  }
  await recordHistory.append(ctx, tx, {
    recordType: "terms",
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [
      {
        recordId: policy.termsId,
        changes: [
          {
            field: `timeOff.${policy.timeOffType.id}`,
            oldValue,
            newValue,
            newLabel: policy.timeOffType.name,
          },
        ],
      },
    ],
  });
}

export function isTermsPolicy(
  policy: TimeOffPolicy,
  termsId: string,
  timeOffTypeId: string,
): boolean {
  return policy.termsId === termsId && policy.timeOffType.id === timeOffTypeId;
}

export async function findPolicy(tx: Tx, timeOffPolicyId: string): Promise<TimeOffPolicy> {
  const policies = await timeOffPolicyRepository(tx).findAll();
  return policies.find(({ id }) => id === timeOffPolicyId)!;
}

/** The policy acted on; refuses one that does not exist with NOT_FOUND. */
export function existingPolicy(
  policies: readonly TimeOffPolicy[],
  timeOffPolicyId: string,
): TimeOffPolicy {
  const policy = policies.find(({ id }) => id === parseUuid(timeOffPolicyId));
  if (!policy) {
    throw new ApplicationError("NOT_FOUND", "No time off policy has this id.");
  }
  return policy;
}

/** The type acted on; refuses one that does not exist as invalid input. */
export function existingType(types: readonly TimeOffType[], timeOffTypeId: string): TimeOffType {
  const type = types.find(({ id }) => id === parseUuid(timeOffTypeId));
  if (!type) {
    throw invalidInput([{ field: "timeOffTypeId", code: "not_found" }]);
  }
  return type;
}

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
