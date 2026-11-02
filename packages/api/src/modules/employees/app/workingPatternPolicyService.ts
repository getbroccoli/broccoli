import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import { workingPatternRepository } from "../db";
import {
  parseDateField,
  parsePolicyName,
  parseWeek,
  type WeekdayMinutes,
  type WorkingPatternPolicy,
} from "../domain";
import { publishWorkingPatternChange } from "./publishWorkingPatternChange";

/**
 * The working pattern policies admins keep: their names and dated weeks. A change to a policy's
 * minutes is a new week from a date, so earlier weeks keep theirs.
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
      const saved = await transact(async (tx) => {
        const patterns = workingPatternRepository(tx);
        await patterns.lockForWrites();
        refuseTakenName(await patterns.findPolicies(), name);
        return findPolicy(tx, await patterns.insertPolicy(name, week));
      });
      logger.info({ workingPatternPolicyId: saved.id }, "Created a working pattern policy");
      return saved;
    },

    async renamePolicy(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const name = parsePolicyName(input.name);
      const saved = await transact(async (tx) => {
        const patterns = workingPatternRepository(tx);
        await patterns.lockForWrites();
        const policies = await patterns.findPolicies();
        const policy = existingPolicy(policies, input.policyId);
        refuseTakenName(
          policies.filter(({ id }) => id !== policy.id),
          name,
        );
        await patterns.renamePolicy(policy.id, name);
        return findPolicy(tx, policy.id);
      });
      logger.info({ workingPatternPolicyId: saved.id }, "Renamed a working pattern policy");
      return saved;
    },

    async changePolicy(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveFrom = parseDateField("effectiveFrom", input.effectiveFrom);
      const week = parseWeek(input);
      const saved = await transact(async (tx) => {
        const patterns = workingPatternRepository(tx);
        await patterns.lockForWrites();
        const policy = existingPolicy(await patterns.findPolicies(), input.policyId);
        await patterns.saveWeek(policy.id, { ...week, effectiveFrom });
        publishWorkingPatternChange(
          tx,
          await patterns.findEmployeesOnPolicy(policy.id),
          effectiveFrom,
        );
        return findPolicy(tx, policy.id);
      });
      logger.info(
        { workingPatternPolicyId: saved.id, effectiveFrom },
        "Changed a working pattern policy",
      );
      return saved;
    },

    async removePolicyWeek(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveFrom = parseDateField("effectiveFrom", input.effectiveFrom);
      const saved = await transact(async (tx) => {
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
        return findPolicy(tx, policy.id);
      });
      logger.info(
        { workingPatternPolicyId: saved.id, effectiveFrom },
        "Removed a working pattern week",
      );
      return saved;
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
            "A person or group is on this working pattern on some date, past or future, so it is kept.",
          );
        }
        await patterns.deletePolicy(policy.id);
        return policy.id;
      });
      logger.info({ workingPatternPolicyId: policyId }, "Deleted a working pattern policy");
    },
  };
}

/** The policy an input names; refuses one that does not exist as invalid input. */
export function referencedPolicy(policies: readonly WorkingPatternPolicy[], policyId: string) {
  const policy = policies.find(({ id }) => id === parseUuid(policyId));
  if (!policy) {
    throw invalidInput([{ field: "policyId", code: "not_found" }]);
  }
  return policy;
}

async function findPolicy(db: Orm | Tx, policyId: string): Promise<WorkingPatternPolicy> {
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
