import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Transact, Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, coversDate, parseUuid } from "../../../utils";
import { type EmployeeReadService, parseChangeDate } from "../../employees";
import { type PolicyAssignment, timeOffPolicyRepository, timeOffRepository } from "../db";
import { isPlannedStop } from "../domain";
import { readPeople } from "./allowanceEngine";
import {
  appendRulesHistory,
  employeesOf,
  existingTerms,
  existingType,
  ownerIds,
  rulesChanged,
  versionOf,
} from "./policyRules";
import type { TimeOffService } from "./timeOffService";

export interface StopDependencies {
  transact: Transact;
  logger: Logger;
  employeeReads: EmployeeReadService;
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  today: () => CalendarDate;
}

/**
 * Stops offering the type on the terms from `stopDate`; logs the outcome, or why it was refused.
 * Returns the assignment that now ends the day before.
 */
export async function stopPolicy(
  dependencies: StopDependencies,
  ctx: SecurityContext,
  input: { termsId: string; timeOffTypeId: string; stopDate: string },
): Promise<PolicyAssignment> {
  ctx.require("MANAGE_WORKSPACE");
  const { logger } = dependencies;
  const { stopped, ...outcome } = await dependencies
    .transact((tx) => stopTermsPolicy(dependencies, ctx, tx, input))
    .catch((error: unknown) => {
      if (error instanceof ApplicationError) {
        const ids = {
          termsId: parseUuid(input.termsId),
          timeOffTypeId: parseUuid(input.timeOffTypeId),
        };
        logger.info({ ...ids, code: error.code }, "Refused to stop offering a time off type");
      }
      throw error;
    });
  logger.info(
    {
      assignmentId: stopped.id,
      ...stopped.owner,
      timeOffTypeId: stopped.timeOffTypeId,
      ...outcome,
    },
    "Stopped offering a time off type",
  );
  return stopped;
}

/** Cancels a planned stop by the assignment it ends, which runs on open-ended. */
export async function cancelPolicyStop(
  dependencies: StopDependencies,
  ctx: SecurityContext,
  input: { assignmentId: string },
): Promise<void> {
  ctx.require("MANAGE_WORKSPACE");
  const { stopped, ...outcome } = await dependencies.transact((tx) =>
    cancelPlannedStop(dependencies, ctx, tx, input.assignmentId),
  );
  dependencies.logger.info(
    {
      assignmentId: stopped.id,
      ...stopped.owner,
      timeOffTypeId: stopped.timeOffTypeId,
      ...outcome,
    },
    "Cancelled stopping a time off type",
  );
}

/**
 * Ends the terms' rules for the type the day before `stopDate` and deletes their later rows;
 * returns the row that ends. INVALID_INPUT when the type is not offered the day before; CONFLICT
 * while someone's booked time off of the type from `stopDate` would be left without rules.
 */
async function stopTermsPolicy(
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

/**
 * Makes the assignment a planned stop ends open-ended again, with a line in its owner's history.
 * NOT_FOUND without such an assignment; CONFLICT when it is no planned stop.
 */
async function cancelPlannedStop(
  { employeeReads, timeOff, today }: StopDependencies,
  ctx: SecurityContext,
  tx: Tx,
  assignmentId: string,
) {
  const repository = timeOffPolicyRepository(tx);
  await repository.lockPolicies();
  const id = parseUuid(assignmentId);
  const [stopped] = id ? await repository.findAssignmentsById([id]) : [];
  if (!stopped) {
    throw new ApplicationError("NOT_FOUND", "No time off rules have this id.");
  }
  const lane = (await repository.findAssignments(ownerIds(stopped.owner))).filter(
    (row) => row.timeOffTypeId === stopped.timeOffTypeId,
  );
  if (!isPlannedStop(lane, stopped, today())) {
    throw new ApplicationError("CONFLICT", "This type has no planned stop.");
  }
  const stopDate = addDays(stopped.endDate!, 1);
  await repository.endAssignment(stopped.id, null);
  const timeOffType = existingType(await repository.findAllTypes(), stopped.timeOffTypeId);
  await appendRulesHistory(ctx, tx, stopped.owner, timeOffType, {
    before: { stopDate },
    after: null,
  });
  const ensured = await timeOff.ensureAllowances(ctx, tx, {
    employeeIds: await employeesOf(employeeReads, tx, stopped.owner),
    cause: rulesChanged(stopped.timeOffPolicyId, stopDate),
  });
  return { stopped, stopDate, ...ensured };
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
  const timelines = (people: typeof before.people) =>
    new Map(people.map((person) => [person.employeeId, person.timelineOf(input.timeOffTypeId)]));
  const [rulesBefore, rulesAfter] = [timelines(before.people), timelines(after.people)];
  const losing = new Set(
    booked
      .filter(
        ({ employeeId, date }) =>
          rulesBefore.get(employeeId)!.getVersionOnDate(date) !== null &&
          rulesAfter.get(employeeId)!.getVersionOnDate(date) === null,
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
