import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import { createRecordHistoryService, type HistoryLine } from "../../../core/records";
import { isInRecordScope, type SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, parseUuid } from "../../../utils";
import { employeeRepository, policyGroupRepository, workingPatternRepository } from "../db";
import {
  covers,
  makeRoom,
  parseDateField,
  parseEmployeeIds,
  parsePolicyName,
  parseWeek,
  policyOn,
  type WeekdayMinutes,
  type WorkingPatternPolicy,
  type WorkingPatternTimeline,
  type WorkingWeek,
  workingWeeksOf,
} from "../domain";
import { employeeNotFound } from "./employeeNotFound";

const recordHistory = createRecordHistoryService();

/**
 * Working patterns: the policies groups and people are put on from a date, and the working weeks
 * other modules read. Every change is dated; a past date is a correction.
 */
export interface WorkingPatternService {
  /**
   * Each employee's working weeks from `from` to `until`, by id: the first starts on `from`, a new
   * one wherever minutes or full day change. Refuses with FORBIDDEN an employee whose working
   * pattern the caller may not read, and with NOT_FOUND an id that names no employee.
   */
  readWorkingWeeks: (
    ctx: SecurityContext,
    input: { employeeIds: readonly string[]; from: string; until: string },
  ) => Promise<Map<string, WorkingWeek[]>>;
  /** Every policy with its weeks, by name. Admins only. */
  listPolicies: (ctx: SecurityContext) => Promise<WorkingPatternPolicy[]>;
  /** A new policy whose only week applies from the beginning. Admins only. */
  createPolicy: (
    ctx: SecurityContext,
    input: { name: string; minutes: WeekdayMinutes; fullDayMinutes: number },
  ) => Promise<WorkingPatternPolicy>;
  /** Renames a policy for every date. Admins only. */
  renamePolicy: (
    ctx: SecurityContext,
    input: { policyId: string; name: string },
  ) => Promise<WorkingPatternPolicy>;
  /** New minutes for a policy from a date, replacing a week that starts on it. Admins only. */
  changePolicy: (
    ctx: SecurityContext,
    input: {
      policyId: string;
      effectiveFrom: string;
      minutes: WeekdayMinutes;
      fullDayMinutes: number;
    },
  ) => Promise<WorkingPatternPolicy>;
  /** Removes the week that starts on a date, so the one before applies again. Admins only. */
  removePolicyWeek: (
    ctx: SecurityContext,
    input: { policyId: string; effectiveFrom: string },
  ) => Promise<WorkingPatternPolicy>;
  /** Deletes a policy no group or person is put on, other than Standard. Admins only. */
  deletePolicy: (ctx: SecurityContext, input: { policyId: string }) => Promise<void>;
  /** Puts a group on a policy from a date; its earlier policy ends the day before. Admins only. */
  setGroupPattern: (
    ctx: SecurityContext,
    input: { policyGroupId: string; policyId: string; effectiveFrom: string },
  ) => Promise<void>;
  /** Ends the group's policy on a date; the group then has none. Admins only. */
  endGroupPattern: (
    ctx: SecurityContext,
    input: { policyGroupId: string; effectiveUntil: string },
  ) => Promise<void>;
  /** Removes the group's policy that starts on a date, null for from the beginning. Admins only. */
  removeGroupPattern: (
    ctx: SecurityContext,
    input: { policyGroupId: string; effectiveFrom: string | null },
  ) => Promise<void>;
  /**
   * Puts a person on their own policy from a date, until a date or open-ended, ahead of their
   * group's; an earlier one of theirs ends the day before. Returns the history line it added.
   */
  assignPolicy: (
    ctx: SecurityContext,
    input: {
      employeeId: string;
      policyId: string;
      effectiveFrom: string;
      effectiveUntil?: string | null;
    },
  ) => Promise<HistoryLine>;
  /** Ends a person's own policy on a date; their group's applies from the next day. */
  endAssignment: (
    ctx: SecurityContext,
    input: { employeeId: string; effectiveUntil: string },
  ) => Promise<HistoryLine>;
  /** Removes a person's own policy that starts on a date, as a correction. */
  removeAssignment: (
    ctx: SecurityContext,
    input: { employeeId: string; effectiveFrom: string },
  ) => Promise<HistoryLine>;
}

export function createWorkingPatternService({
  orm,
  transact,
  logger,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger">): WorkingPatternService {
  return {
    async readWorkingWeeks(ctx, input) {
      const from = parseDateField("from", input.from);
      const until = parseUntil(from, input.until, "until");
      const employeeIds = parseEmployeeIds(input.employeeIds);
      const scope = await ctx.recordScope("working_pattern", "read");
      if (employeeIds.some((id) => !isInRecordScope(scope, id))) {
        throw new ApplicationError("FORBIDDEN", "You cannot read this working pattern.");
      }
      if ((await employeeRepository(orm).findByIds(employeeIds)).length < employeeIds.length) {
        throw employeeNotFound();
      }
      const timelines = await readTimelines(orm, employeeIds);
      return new Map(
        employeeIds.map((id) => [id, workingWeeksOf(timelines.get(id)!, from, until)]),
      );
    },

    async listPolicies(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      return workingPatternRepository(orm).findPolicies();
    },

    async createPolicy(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const name = parsePolicyName(input.name);
      const week = parseWeek(input);
      const policyId = await transact(async (tx) => {
        const patterns = workingPatternRepository(tx);
        await patterns.lockForWrites();
        refuseTakenName(await patterns.findPolicies(), name);
        return patterns.insertPolicy(name, week);
      });
      logger.info({ workingPatternPolicyId: policyId }, "Created a working pattern policy");
      return findPolicy(orm, policyId);
    },

    async renamePolicy(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const name = parsePolicyName(input.name);
      const policyId = await transact(async (tx) => {
        const patterns = workingPatternRepository(tx);
        await patterns.lockForWrites();
        const policies = await patterns.findPolicies();
        const policy = existingPolicy(policies, input.policyId);
        refuseTakenName(
          policies.filter(({ id }) => id !== policy.id),
          name,
        );
        await patterns.renamePolicy(policy.id, name);
        return policy.id;
      });
      logger.info({ workingPatternPolicyId: policyId }, "Renamed a working pattern policy");
      return findPolicy(orm, policyId);
    },

    async changePolicy(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveFrom = parseDateField("effectiveFrom", input.effectiveFrom);
      const week = parseWeek(input);
      const policyId = await transact(async (tx) => {
        const patterns = workingPatternRepository(tx);
        await patterns.lockForWrites();
        const policy = existingPolicy(await patterns.findPolicies(), input.policyId);
        await patterns.saveWeek(policy.id, { ...week, effectiveFrom });
        publishChange(tx, await patterns.findEmployeesOnPolicy(policy.id), effectiveFrom);
        return policy.id;
      });
      logger.info(
        { workingPatternPolicyId: policyId, effectiveFrom },
        "Changed a working pattern policy",
      );
      return findPolicy(orm, policyId);
    },

    async removePolicyWeek(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveFrom = parseDateField("effectiveFrom", input.effectiveFrom);
      const policyId = await transact(async (tx) => {
        const patterns = workingPatternRepository(tx);
        await patterns.lockForWrites();
        const policy = existingPolicy(await patterns.findPolicies(), input.policyId);
        if (!(await patterns.deleteWeek(policy.id, effectiveFrom))) {
          throw new ApplicationError(
            "NOT_FOUND",
            "The working pattern has no week from this date.",
          );
        }
        publishChange(tx, await patterns.findEmployeesOnPolicy(policy.id), effectiveFrom);
        return policy.id;
      });
      logger.info(
        { workingPatternPolicyId: policyId, effectiveFrom },
        "Removed a working pattern week",
      );
      return findPolicy(orm, policyId);
    },

    async deletePolicy(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const policyId = await transact(async (tx) => {
        const patterns = workingPatternRepository(tx);
        await patterns.lockForWrites();
        const policy = existingPolicy(await patterns.findPolicies(), input.policyId);
        if (policy.isStandard) {
          throw new ApplicationError("CONFLICT", "The Standard working pattern cannot be deleted.");
        }
        if (await patterns.isPolicyUsed(policy.id)) {
          throw new ApplicationError(
            "CONFLICT",
            "Move everyone and every group off this working pattern first.",
          );
        }
        await patterns.deletePolicy(policy.id);
        return policy.id;
      });
      logger.info({ workingPatternPolicyId: policyId }, "Deleted a working pattern policy");
    },

    async setGroupPattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveFrom = parseDateField("effectiveFrom", input.effectiveFrom);
      const policyGroupId = await transact(async (tx) => {
        const patterns = workingPatternRepository(tx);
        await patterns.lockForWrites();
        const groupId = await existingGroup(tx, input.policyGroupId);
        const policy = referencedPolicy(await patterns.findPolicies(), input.policyId);
        const rows = (await patterns.findGroupPolicies([groupId])).get(groupId) ?? [];
        const { ended, replaced } = makeRoom(rows, effectiveFrom, null);
        if (replaced) {
          await patterns.deleteGroupPolicy(replaced.id);
        }
        if (ended) {
          await patterns.endGroupPolicy(ended.id, addDays(effectiveFrom, -1));
        }
        await patterns.insertGroupPolicy(groupId, {
          policyId: policy.id,
          effectiveFrom,
          effectiveUntil: null,
        });
        publishChange(tx, await policyGroupRepository(tx).findMemberIds(groupId), effectiveFrom);
        return groupId;
      });
      logger.info({ policyGroupId, effectiveFrom }, "Set a group's working pattern");
    },

    async endGroupPattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveUntil = parseDateField("effectiveUntil", input.effectiveUntil);
      const policyGroupId = await transact(async (tx) => {
        const patterns = workingPatternRepository(tx);
        await patterns.lockForWrites();
        const groupId = await existingGroup(tx, input.policyGroupId);
        const rows = (await patterns.findGroupPolicies([groupId])).get(groupId) ?? [];
        const row = rows.find((candidate) => covers(candidate, effectiveUntil));
        if (!row) {
          throw new ApplicationError("NOT_FOUND", "The group has no working pattern on this date.");
        }
        await patterns.endGroupPolicy(row.id, effectiveUntil);
        const members = await policyGroupRepository(tx).findMemberIds(groupId);
        publishChange(tx, members, addDays(effectiveUntil, 1));
        return groupId;
      });
      logger.info({ policyGroupId, effectiveUntil }, "Ended a group's working pattern");
    },

    async removeGroupPattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveFrom =
        input.effectiveFrom === null ? null : parseDateField("effectiveFrom", input.effectiveFrom);
      const policyGroupId = await transact(async (tx) => {
        const patterns = workingPatternRepository(tx);
        await patterns.lockForWrites();
        const groupId = await existingGroup(tx, input.policyGroupId);
        const rows = (await patterns.findGroupPolicies([groupId])).get(groupId) ?? [];
        const row = rows.find((candidate) => candidate.effectiveFrom === effectiveFrom);
        if (!row) {
          throw new ApplicationError(
            "NOT_FOUND",
            "The group has no working pattern from this date.",
          );
        }
        await patterns.deleteGroupPolicy(row.id);
        publishChange(tx, await policyGroupRepository(tx).findMemberIds(groupId), effectiveFrom);
        return groupId;
      });
      logger.info({ policyGroupId, effectiveFrom }, "Removed a group's working pattern");
    },

    async assignPolicy(ctx, input) {
      const employeeId = await requireAssignmentWrite(ctx, input.employeeId);
      const effectiveFrom = parseDateField("effectiveFrom", input.effectiveFrom);
      const effectiveUntil =
        input.effectiveUntil == null
          ? null
          : parseUntil(effectiveFrom, input.effectiveUntil, "effectiveUntil");
      return changeAssignments(ctx, employeeId, effectiveFrom, async (tx, rows) => {
        const patterns = workingPatternRepository(tx);
        const policy = referencedPolicy(await patterns.findPolicies(), input.policyId);
        const { ended, replaced } = makeRoom(rows, effectiveFrom, effectiveUntil);
        if (replaced) {
          await patterns.deleteAssignment(replaced.id);
        }
        if (ended) {
          await patterns.endAssignment(ended.id, addDays(effectiveFrom, -1));
        }
        await patterns.insertAssignment(employeeId, {
          policyId: policy.id,
          effectiveFrom,
          effectiveUntil,
        });
      });
    },

    async endAssignment(ctx, input) {
      const employeeId = await requireAssignmentWrite(ctx, input.employeeId);
      const effectiveUntil = parseDateField("effectiveUntil", input.effectiveUntil);
      return changeAssignments(ctx, employeeId, addDays(effectiveUntil, 1), async (tx, rows) => {
        const row = rows.find((candidate) => covers(candidate, effectiveUntil));
        if (!row) {
          throw noOwnPattern();
        }
        await workingPatternRepository(tx).endAssignment(row.id, effectiveUntil);
      });
    },

    async removeAssignment(ctx, input) {
      const employeeId = await requireAssignmentWrite(ctx, input.employeeId);
      const effectiveFrom = parseDateField("effectiveFrom", input.effectiveFrom);
      return changeAssignments(ctx, employeeId, effectiveFrom, async (tx, rows) => {
        const row = rows.find((candidate) => candidate.effectiveFrom === effectiveFrom);
        if (!row) {
          throw noOwnPattern();
        }
        await workingPatternRepository(tx).deleteAssignment(row.id);
      });
    },
  };

  /**
   * Changes one person's own dated policies in one transaction, then writes the history line
   * naming the policy that applied on `changedFrom` before and after, and publishes the change.
   */
  async function changeAssignments(
    ctx: SecurityContext,
    employeeId: string,
    changedFrom: CalendarDate,
    change: (tx: Tx, rows: Awaited<ReturnType<typeof ownRows>>) => Promise<void>,
  ): Promise<HistoryLine> {
    const line = await transact(async (tx) => {
      await workingPatternRepository(tx).lockForWrites();
      if (!(await employeeRepository(tx).findById(employeeId))) {
        throw employeeNotFound();
      }
      const before = await policyNameOn(tx, employeeId, changedFrom);
      await change(tx, await ownRows(tx, employeeId));
      const after = await policyNameOn(tx, employeeId, changedFrom);
      publishChange(tx, [employeeId], changedFrom);
      const [added] = await recordHistory.append(ctx, tx, {
        recordType: "working_pattern",
        operation: "UPDATED",
        cause: { kind: "EDITED_DIRECTLY" },
        records: [
          {
            recordId: employeeId,
            changes: [
              { field: "workingPattern", oldValue: before, newValue: after },
              { field: "effectiveFrom", oldValue: null, newValue: changedFrom },
            ],
          },
        ],
      });
      return added!;
    });
    logger.info({ employeeId, effectiveFrom: changedFrom }, "Changed a person's working pattern");
    return line;
  }
}

/** The working pattern of each employee: their own policies, groups, and the policies' weeks. */
async function readTimelines(
  db: Orm | Tx,
  employeeIds: readonly string[],
): Promise<Map<string, WorkingPatternTimeline>> {
  const patterns = workingPatternRepository(db);
  const [assignments, memberships, policies] = await Promise.all([
    patterns.findAssignments(employeeIds),
    policyGroupRepository(db).findMemberships(employeeIds),
    patterns.findPolicies(),
  ]);
  const groupIds = [...memberships.values()].flat().map(({ policyGroupId }) => policyGroupId);
  const groupPolicies = await patterns.findGroupPolicies([...new Set(groupIds)]);
  const policyWeeks = new Map(policies.map(({ id, weeks }) => [id, weeks]));
  return new Map(
    employeeIds.map((id) => [
      id,
      {
        assignments: assignments.get(id) ?? [],
        memberships: memberships.get(id) ?? [],
        groupPolicies,
        policyWeeks,
      },
    ]),
  );
}

async function policyNameOn(tx: Tx, employeeId: string, date: CalendarDate) {
  const timeline = (await readTimelines(tx, [employeeId])).get(employeeId)!;
  const policyId = policyOn(timeline, date);
  const policies = await workingPatternRepository(tx).findPolicies();
  return policies.find(({ id }) => id === policyId)?.name ?? null;
}

async function ownRows(tx: Tx, employeeId: string) {
  return (await workingPatternRepository(tx).findAssignments([employeeId])).get(employeeId) ?? [];
}

async function requireAssignmentWrite(ctx: SecurityContext, employeeId: string) {
  const id = parseUuid(employeeId);
  if (!id) {
    throw employeeNotFound();
  }
  await ctx.requireInScope("working_pattern", "update", id);
  return id;
}

async function findPolicy(db: Orm, policyId: string): Promise<WorkingPatternPolicy> {
  const policies = await workingPatternRepository(db).findPolicies();
  return policies.find(({ id }) => id === policyId)!;
}

/** The policy acted on; refuses one that does not exist with NOT_FOUND. */
function existingPolicy(policies: readonly WorkingPatternPolicy[], policyId: string) {
  const policy = policies.find(({ id }) => id === parseUuid(policyId));
  if (!policy) {
    throw new ApplicationError("NOT_FOUND", "No working pattern has this id.");
  }
  return policy;
}

/** The policy an input names; refuses one that does not exist as invalid input. */
function referencedPolicy(policies: readonly WorkingPatternPolicy[], policyId: string) {
  const policy = policies.find(({ id }) => id === parseUuid(policyId));
  if (!policy) {
    throw invalidInput([{ field: "policyId", code: "not_found" }]);
  }
  return policy;
}

async function existingGroup(tx: Tx, policyGroupId: string): Promise<string> {
  const id = parseUuid(policyGroupId);
  if (!id || !(await policyGroupRepository(tx).exists(id))) {
    throw invalidInput([{ field: "policyGroupId", code: "not_found" }]);
  }
  return id;
}

function refuseTakenName(policies: readonly WorkingPatternPolicy[], name: string) {
  if (policies.some((policy) => policy.name === name)) {
    throw invalidInput([{ field: "name", code: "taken" }]);
  }
}

function parseUntil(from: CalendarDate, value: string, field: string): CalendarDate {
  const until = parseDateField(field, value);
  if (until < from) {
    throw invalidInput([{ field, code: "before_start" }]);
  }
  return until;
}

function publishChange(tx: Tx, employeeIds: readonly string[], from: CalendarDate | null) {
  if (employeeIds.length > 0) {
    tx.publish("employees.working_pattern_changed", { employeeIds: [...employeeIds], from });
  }
}

function noOwnPattern(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "The person has no working pattern of their own here.");
}
