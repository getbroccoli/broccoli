import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, coversDate } from "../../../utils";
import { type EmployeeReadService, parseChangeDate } from "../../employees";
import { type PolicyAssignment, timeOffPolicyRepository, timeOffRepository } from "../db";
import { readPeople } from "./allowanceEngine";
import {
  appendRulesHistory,
  employeesOf,
  existingTerms,
  existingType,
  rulesChanged,
  versionOf,
} from "./policyRules";
import type { TimeOffService } from "./timeOffService";

export interface StopDependencies {
  employeeReads: EmployeeReadService;
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  today: () => CalendarDate;
}

/**
 * Ends the terms' rules for the type the day before `stopDate` and deletes their later rows;
 * returns the row that ends. INVALID_INPUT when the type is not offered the day before; CONFLICT
 * while someone's booked time off of the type from `stopDate` would be left without rules.
 */
export async function stopTermsPolicy(
  { employeeReads, timeOff, today }: StopDependencies,
  ctx: SecurityContext,
  tx: Tx,
  input: { termsId: string; timeOffTypeId: string; stopDate: string },
) {
  const repository = timeOffPolicyRepository(tx);
  await repository.lockPolicies();
  const termsId = await existingTerms(employeeReads, tx, input.termsId);
  const timeOffType = existingType(await repository.findAllTypes(), input.timeOffTypeId);
  const stopDate = parseChangeDate(input.stopDate, today(), "stopDate");
  const lane = (await repository.findAssignments({ termsIds: [termsId] })).filter(
    (row) => row.timeOffTypeId === timeOffType.id,
  );
  const lastDay = addDays(stopDate, -1);
  const stopped = lane.find((row) => coversDate(row, lastDay));
  if (!stopped) {
    throw invalidInput([{ field: "stopDate", code: "not_offered" }]);
  }
  const later = lane.filter((row) => row.startDate >= stopDate);
  const employeeIds = await employeesOf(employeeReads, tx, { termsId });
  await refuseBookedTimeOff(employeeReads, tx, {
    employeeIds,
    timeOffTypeId: timeOffType.id,
    stopDate,
    removed: (row) => row.id === stopped.id || later.some(({ id }) => id === row.id),
    stopped: { ...stopped, endDate: lastDay },
  });
  for (const row of later) {
    await repository.deleteAssignment(row.id);
  }
  await repository.endAssignment(stopped.id, lastDay);
  const policies = await repository.findAll();
  await appendRulesHistory(ctx, tx, stopped.owner, timeOffType, {
    before: { ...versionOf(policies, stopped.versionId), startDate: stopped.startDate },
    after: { stopDate },
  });
  const ensured = await timeOff.ensureAllowances(ctx, tx, {
    employeeIds,
    cause: rulesChanged(stopped.timeOffPolicyId, stopDate),
  });
  return {
    stopped: { ...stopped, endDate: lastDay },
    stopDate,
    reachedCount: employeeIds.length,
    ...ensured,
  };
}

/** Makes the row a planned stop ends open-ended again, with a line in the terms' history. */
export async function cancelTermsStop(
  { employeeReads, timeOff }: StopDependencies,
  ctx: SecurityContext,
  tx: Tx,
  stopped: PolicyAssignment,
) {
  const repository = timeOffPolicyRepository(tx);
  const stopDate = addDays(stopped.endDate!, 1);
  await repository.endAssignment(stopped.id, null);
  const timeOffType = existingType(await repository.findAllTypes(), stopped.timeOffTypeId);
  await appendRulesHistory(ctx, tx, stopped.owner, timeOffType, {
    before: { stopDate },
    after: null,
  });
  return timeOff.ensureAllowances(ctx, tx, {
    employeeIds: await employeesOf(employeeReads, tx, stopped.owner),
    cause: rulesChanged(stopped.timeOffPolicyId, stopDate),
  });
}

/**
 * Refuses, with CONFLICT, a stop that would leave a booked day without rules: one the terms' rows
 * cover for the person today and nothing covers once `removed` go and `stopped` ends.
 */
async function refuseBookedTimeOff(
  employeeReads: EmployeeReadService,
  tx: Tx,
  input: {
    employeeIds: string[];
    timeOffTypeId: string;
    stopDate: CalendarDate;
    removed: (row: PolicyAssignment) => boolean;
    stopped: PolicyAssignment;
  },
) {
  const booked = await timeOffRepository(tx).findDaysFrom({
    employeeIds: input.employeeIds,
    timeOffTypeId: input.timeOffTypeId,
    from: input.stopDate,
  });
  if (booked.length === 0) {
    return;
  }
  const ids = [...new Set(booked.map(({ employeeId }) => employeeId))];
  const [before, after] = await Promise.all([
    readPeople(employeeReads, tx, ids),
    readPeople(employeeReads, tx, ids, (stored) => [
      ...stored.filter((row) => !input.removed(row)),
      input.stopped,
    ]),
  ]);
  const hasRules = (people: typeof before.people, employeeId: string, date: CalendarDate) =>
    people
      .find((person) => person.employeeId === employeeId)!
      .timelineOf(input.timeOffTypeId)
      .getVersionOnDate(date) !== null;
  const losing = new Set(
    booked
      .filter(
        ({ employeeId, date }) =>
          hasRules(before.people, employeeId, date) && !hasRules(after.people, employeeId, date),
      )
      .map(({ employeeId }) => employeeId),
  );
  if (losing.size > 0) {
    throw new ApplicationError(
      "CONFLICT",
      losing.size === 1
        ? "1 person has this time off type booked from that date."
        : `${losing.size} people have this time off type booked from that date.`,
    );
  }
}
