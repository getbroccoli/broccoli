import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, parseUuid } from "../../../utils";
import { policyGroupRepository, workingPatternRepository } from "../db";
import {
  coversDate,
  type DatedPolicy,
  makeRoomForDatedPolicy,
  parseDateField,
  parsePolicyName,
  parseWeek,
  type WeekdayMinutes,
  type WorkingPatternPolicy,
} from "../domain";
import { publishWorkingPatternChange } from "./publishWorkingPatternChange";

/**
 * The working pattern policies admins keep, and the one each group works from a date. A change to
 * a policy's minutes is a new week from a date, so earlier weeks keep theirs.
 */
export interface WorkingPatternPolicyService {
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
}

export function createWorkingPatternPolicyService({
  orm,
  transact,
  logger,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger">): WorkingPatternPolicyService {
  return {
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
        publishWorkingPatternChange(
          tx,
          await patterns.findEmployeesOnPolicy(policy.id),
          effectiveFrom,
        );
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
        publishWorkingPatternChange(
          tx,
          await patterns.findEmployeesOnPolicy(policy.id),
          effectiveFrom,
        );
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
      await changeGroupPatterns(input.policyGroupId, effectiveFrom, async (tx, groupId, rows) => {
        const patterns = workingPatternRepository(tx);
        const policy = referencedPolicy(await patterns.findPolicies(), input.policyId);
        const { ended, replaced } = makeRoomForDatedPolicy(rows, effectiveFrom, null);
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
      });
    },

    async endGroupPattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveUntil = parseDateField("effectiveUntil", input.effectiveUntil);
      const changedFrom = addDays(effectiveUntil, 1);
      await changeGroupPatterns(input.policyGroupId, changedFrom, async (tx, _groupId, rows) => {
        const row = rows.find((candidate) => coversDate(candidate, effectiveUntil));
        if (!row) {
          throw noGroupPattern();
        }
        await workingPatternRepository(tx).endGroupPolicy(row.id, effectiveUntil);
      });
    },

    async removeGroupPattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveFrom =
        input.effectiveFrom === null ? null : parseDateField("effectiveFrom", input.effectiveFrom);
      await changeGroupPatterns(input.policyGroupId, effectiveFrom, async (tx, _groupId, rows) => {
        const row = rows.find((candidate) => candidate.effectiveFrom === effectiveFrom);
        if (!row) {
          throw noGroupPattern();
        }
        await workingPatternRepository(tx).deleteGroupPolicy(row.id);
      });
    },
  };

  /**
   * Changes one group's dated policies in one transaction and tells other modules its members'
   * working weeks may have changed from `changedFrom`.
   */
  async function changeGroupPatterns(
    policyGroupId: string,
    changedFrom: CalendarDate | null,
    change: (tx: Tx, groupId: string, rows: DatedPolicy[]) => Promise<void>,
  ): Promise<void> {
    const groupId = await transact(async (tx) => {
      const patterns = workingPatternRepository(tx);
      await patterns.lockForWrites();
      const id = await existingGroup(tx, policyGroupId);
      await change(tx, id, (await patterns.findGroupPolicies([id])).get(id) ?? []);
      const members = await policyGroupRepository(tx).findMemberIds(id);
      publishWorkingPatternChange(tx, members, changedFrom);
      return id;
    });
    logger.info({ policyGroupId: groupId, changedFrom }, "Changed a group's working pattern");
  }
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

function refuseTakenName(policies: readonly WorkingPatternPolicy[], name: string) {
  if (policies.some((policy) => policy.name === name)) {
    throw invalidInput([{ field: "name", code: "taken" }]);
  }
}

/** The policy an input names; refuses one that does not exist as invalid input. */
export function referencedPolicy(policies: readonly WorkingPatternPolicy[], policyId: string) {
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

function noGroupPattern(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "The group has no working pattern on this date.");
}
