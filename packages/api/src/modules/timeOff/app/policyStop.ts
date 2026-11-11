import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Transact, Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, parseUuid } from "../../../utils";
import {
  type AssignmentOwner,
  applyAssignmentPlan,
  type EmployeeReadService,
  isSameOwner,
} from "../../employees";
import { timeOffPolicyRepository, timeOffRepository } from "../db";
import { isPlannedStop, type PolicyVersion } from "../domain";
import { readPeople } from "./allowanceEngine";
import type { PolicyPublish } from "./policyPublishPlan";
import {
  appendRulesHistory,
  employeesOf,
  existingType,
  ownerIds,
  rulesChanged,
  saveTermsDraft,
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
 * Saves the terms' unpublished draft for the type as a stop, a copy of their rules for it today;
 * Publish then ends those rules from its date. Replaces a rules draft. INVALID_INPUT when the terms
 * have no rules for the type today.
 */
export async function saveTimeOffStop(
  { transact, logger, employeeReads, today }: StopDependencies,
  ctx: SecurityContext,
  input: { termsId: string; timeOffTypeId: string },
): Promise<PolicyVersion> {
  ctx.require("MANAGE_WORKSPACE");
  const saved = await transact((tx) =>
    saveTermsDraft(employeeReads, tx, { ...input, today: today() }, ({ policies, inForce }) => {
      if (!inForce) {
        throw invalidInput([{ field: "timeOffTypeId", code: "not_offered" }]);
      }
      const { balance, bankHolidays, leaveYear, rules } = versionOf(policies, inForce.versionId);
      return { version: { balance, bankHolidays, leaveYear, rules }, stops: true };
    }),
  );
  logger.info(
    { termsId: input.termsId, timeOffPolicyVersionId: saved.id, revision: saved.revision },
    "Saved an unpublished stop of a time off type",
  );
  return saved;
}

/**
 * Publishes a stop: each ticked owner's rows of the policy end the day before `from` and their
 * later ones go, with a line in the owner's history; the stop draft goes. CONFLICT when booked
 * time off of the type from `from` would be left without rules. Returns the employees reached.
 */
export async function publishStop(
  employeeReads: EmployeeReadService,
  ctx: SecurityContext,
  tx: Tx,
  { version, policy, owners: plans }: PolicyPublish,
  owners: readonly AssignmentOwner[],
  from: CalendarDate,
): Promise<string[]> {
  const repository = timeOffPolicyRepository(tx);
  const ticked = plans.filter(({ owner }) => owners.some((one) => isSameOwner(one, owner)));
  const people = new Set<string>();
  for (const { owner } of ticked) {
    for (const id of await employeesOf(employeeReads, tx, owner)) people.add(id);
  }
  const refuseLostBookings = await watchBookedTimeOff(employeeReads, tx, {
    employeeIds: [...people],
    timeOffTypeId: policy.timeOffType.id,
    from,
  });
  for (const { owner, plan, refusal, replaced } of ticked) {
    if (!plan) {
      throw refusal;
    }
    await applyAssignmentPlan(repository, plan, () => Promise.resolve());
    await appendRulesHistory(ctx, tx, owner, policy.timeOffType, {
      before: replaced && {
        ...versionOf([policy], replaced.versionId),
        startDate: replaced.startDate,
      },
      after: { stopDate: from },
    });
  }
  await refuseLostBookings();
  await repository.deleteVersion(version.id);
  return [...people];
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
 * Notes which booked days of the type from `from` have rules now; the returned check refuses, with
 * CONFLICT, once any of them has none.
 */
async function watchBookedTimeOff(
  employeeReads: EmployeeReadService,
  tx: Tx,
  input: { employeeIds: string[]; timeOffTypeId: string; from: CalendarDate },
): Promise<() => Promise<void>> {
  const booked = await timeOffRepository(tx).findDaysFrom(input);
  const ids = [...new Set(booked.map(({ employeeId }) => employeeId))];
  const coveredDays = async () => {
    const { people } = await readPeople(employeeReads, tx, ids);
    const timelines = new Map(
      people.map((person) => [person.employeeId, person.timelineOf(input.timeOffTypeId)]),
    );
    return booked.map(
      ({ employeeId, date }) => timelines.get(employeeId)!.getVersionOnDate(date) !== null,
    );
  };
  const before = ids.length > 0 ? await coveredDays() : [];
  return async () => {
    if (ids.length === 0) return;
    const after = await coveredDays();
    const losing = new Set(
      booked.filter((_day, i) => before[i] && !after[i]).map(({ employeeId }) => employeeId),
    );
    if (losing.size > 0) {
      throw new ApplicationError(
        "CONFLICT",
        losing.size === 1
          ? "1 person has this time off type booked from that date."
          : `${losing.size} people have this time off type booked from that date.`,
      );
    }
  };
}
