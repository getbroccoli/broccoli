import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import { addDays, type CalendarDate, coversDate } from "../../../utils";
import type { Employee } from "../../employees";
import { timeOffPolicyRepository, timeOffRepository } from "../db";
import type { PolicyVersion, TimeOffPolicy } from "../domain";

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

function bookedMessage(count: number): string {
  return count === 1
    ? "1 person has this time off type booked from that date."
    : `${count} people have this time off type booked from that date.`;
}
