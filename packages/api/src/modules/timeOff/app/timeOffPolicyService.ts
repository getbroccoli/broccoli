import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid, todayInLondon } from "../../../utils";
import {
  cancelPlannedVersion,
  createEmployeeReadService,
  type Employee,
  parseChangeDate,
  parseDateField,
} from "../../employees";
import { timeOffPolicyRepository } from "../db";
import {
  changesCountsMidYear,
  parseRules,
  plannedStop,
  rulesValue,
  stopValue,
  type TimeOffPolicy,
  type TimeOffRulesInput,
  type TimeOffType,
  versionFromRules,
} from "../domain";
import { addVersionFrom } from "./addVersionFrom";
import { appendTermsHistory } from "./appendTermsHistory";
import { cancelStop } from "./cancelStop";
import { endPolicyFrom } from "./endPolicyFrom";
import { readOfferReach, readPolicyReach } from "./policyReach";
import type { TimeOffService } from "./timeOffService";

/**
 * Changes to a time off policy from a date: an offer to terms that don't have the type, new rules,
 * a stop, and cancelling a change that has not started. Each keeps its people's allowances and, on a terms'
 * policy, adds a line to the terms' history. Admins only.
 */
export interface TimeOffPolicyService {
  /**
   * Gives terms their rules for a type they don't have, from a date no earlier than 1 January this
   * year. CONFLICT when the terms already have a policy for the type.
   */
  createPolicy: (
    ctx: SecurityContext,
    input: { termsId: string; timeOffTypeId: string; startDate: string; rules: TimeOffRulesInput },
  ) => Promise<TimeOffPolicy>;
  /**
   * New rules from a date no earlier than 1 January this year: the version covering it ends the day
   * before and the new one runs to that version's end; one starting on the date is replaced. How
   * the type counts changes only from the start of a leave year.
   */
  changePolicy: (
    ctx: SecurityContext,
    input: { timeOffPolicyId: string; startDate: string; rules: TimeOffRulesInput },
  ) => Promise<TimeOffPolicy>;
  /**
   * Stops the policy from a date no earlier than 1 January this year: the version covering the day
   * before ends then, and later versions go. INVALID_INPUT when nothing covers the day before, such
   * as on or before the offer; CONFLICT while anyone it reaches has time off of the type booked from
   * the date.
   */
  stopPolicy: (
    ctx: SecurityContext,
    input: { timeOffPolicyId: string; stopDate: string },
  ) => Promise<TimeOffPolicy>;
  /**
   * Removes the change from a date after today. A version goes and the one before runs to its end;
   * with none before, a policy left without versions goes too, and null comes back. A stop goes and
   * the stopped version is open-ended again. CONFLICT for a change that has started.
   */
  cancelPolicyChange: (
    ctx: SecurityContext,
    input: { timeOffPolicyId: string; startDate: string },
  ) => Promise<TimeOffPolicy | null>;
  /** The people the policy applies to on some day from `from` on, by name. */
  readPolicyReach: (
    ctx: SecurityContext,
    input: { timeOffPolicyId: string; from: string },
  ) => Promise<Employee[]>;
  /**
   * The people an offer of the type from `from` would reach: on the terms on some day from then on,
   * without their own policy for the type that day; by name.
   */
  readOfferReach: (
    ctx: SecurityContext,
    input: { termsId: string; timeOffTypeId: string; from: string },
  ) => Promise<Employee[]>;
}

type Dependencies = Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  today?: () => CalendarDate;
};

export function createTimeOffPolicyService({
  orm,
  transact,
  logger,
  timeOff,
  today = todayInLondon,
}: Dependencies): TimeOffPolicyService {
  const employeeReads = createEmployeeReadService({ orm });
  const reachOf = (tx: Tx, policy: TimeOffPolicy, from: CalendarDate) =>
    readPolicyReach(employeeReads, tx, policy, from);
  return {
    async createPolicy(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const startDate = parseChangeDate(input.startDate, today());
      const rules = parseRules(input.rules);
      const result = await transact(async (tx) => {
        const repository = timeOffPolicyRepository(tx);
        await repository.lockPolicies();
        const termsId = parseUuid(input.termsId);
        if (!termsId || (await employeeReads.readTermsMemberIds(tx, termsId)) === null) {
          throw invalidInput([{ field: "termsId", code: "not_found" }]);
        }
        const timeOffType = existingType(await repository.findAllTypes(), input.timeOffTypeId);
        const policies = await repository.findAll();
        if (policies.some((policy) => isTermsPolicy(policy, termsId, timeOffType.id))) {
          throw new ApplicationError("CONFLICT", "These terms already have this time off type.");
        }
        const reached = await readOfferReach(employeeReads, tx, termsId, timeOffType.id, startDate);
        const version = { ...versionFromRules(rules, null), startDate };
        const policyId = await repository.insertPolicy(
          { termsId, timeOffTypeId: timeOffType.id },
          version,
        );
        await appendTermsHistory(ctx, tx, { termsId, timeOffType }, null, rulesValue(version));
        const ensured = await timeOff.ensureAllowances(ctx, tx, {
          employeeIds: reached.map(({ id }) => id),
          cause: rulesChanged(policyId, startDate),
        });
        return { policy: await findPolicy(tx, policyId), reached, ensured };
      });
      logger.info(
        {
          termsId: result.policy.termsId,
          timeOffTypeId: result.policy.timeOffType.id,
          timeOffPolicyId: result.policy.id,
          startDate,
          reachedCount: result.reached.length,
          ...result.ensured,
        },
        "Offered a time off type",
      );
      return result.policy;
    },

    async changePolicy(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const startDate = parseChangeDate(input.startDate, today());
      const rules = parseRules(input.rules);
      const result = await transact(async (tx) => {
        const repository = timeOffPolicyRepository(tx);
        await repository.lockPolicies();
        const policy = existingPolicy(await repository.findAll(), input.timeOffPolicyId);
        const { before, version } = await addVersionFrom(tx, policy, startDate, rules, today());
        await appendTermsHistory(
          ctx,
          tx,
          policy,
          before && rulesValue(before),
          rulesValue(version),
        );
        const reached = await reachOf(tx, await findPolicy(tx, policy.id), startDate);
        const ensured = await timeOff.ensureAllowances(ctx, tx, {
          employeeIds: reached.map(({ id }) => id),
          cause: rulesChanged(policy.id, startDate),
        });
        return { policy: await findPolicy(tx, policy.id), reached, ensured };
      });
      const { policy } = result;
      logger.info(
        {
          timeOffPolicyId: policy.id,
          termsId: policy.termsId,
          timeOffTypeId: policy.timeOffType.id,
          timeOffPolicyVersionId: policy.versions.find(({ startDate: from }) => from === startDate)
            ?.id,
          startDate,
          reachedCount: result.reached.length,
          ...result.ensured,
        },
        "Changed a time off policy",
      );
      return policy;
    },

    async stopPolicy(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const stopDate = parseChangeDate(input.stopDate, today(), "stopDate");
      const result = await transact(async (tx) => {
        const repository = timeOffPolicyRepository(tx);
        await repository.lockPolicies();
        const policy = existingPolicy(await repository.findAll(), input.timeOffPolicyId);
        const reached = await reachOf(tx, policy, stopDate);
        const stopped = await endPolicyFrom(tx, policy, stopDate, reached);
        await appendTermsHistory(ctx, tx, policy, rulesValue(stopped), stopValue(stopDate));
        const ensured = await timeOff.ensureAllowances(ctx, tx, {
          employeeIds: reached.map(({ id }) => id),
          cause: rulesChanged(policy.id, stopDate),
        });
        return { policy: await findPolicy(tx, policy.id), reached, ensured };
      }).catch((error: unknown) => {
        // A refusal becomes the payload's error, which no other log sees.
        if (error instanceof ApplicationError) {
          const refused = { timeOffPolicyId: input.timeOffPolicyId, stopDate, code: error.code };
          logger.info(refused, "Refused to stop a time off policy");
        }
        throw error;
      });
      const { policy } = result;
      logger.info(
        {
          timeOffPolicyId: policy.id,
          termsId: policy.termsId,
          timeOffTypeId: policy.timeOffType.id,
          stopDate,
          reachedCount: result.reached.length,
          ...result.ensured,
        },
        "Stopped a time off policy",
      );
      return policy;
    },

    async cancelPolicyChange(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const { policy, saved } = await transact(async (tx) => {
        const repository = timeOffPolicyRepository(tx);
        await repository.lockPolicies();
        const policy = existingPolicy(await repository.findAll(), input.timeOffPolicyId);
        const stopped = plannedStop(policy.versions, input.startDate, today());
        if (stopped) {
          const saved = await cancelStop(ctx, tx, { policy, stopped, reachOf, timeOff });
          return { policy, saved };
        }
        const { removed, extended } = cancelPlannedVersion(
          policy.versions,
          input.startDate,
          today(),
        );
        const next = policy.versions.find(({ startDate }) => startDate! > removed.startDate!);
        if (extended && next && changesCountsMidYear(extended, next)) {
          throw new ApplicationError(
            "CONFLICT",
            "Cancelling this change would change how the type counts partway through a leave year.",
          );
        }
        const reached = await reachOf(tx, policy, removed.startDate!);
        await repository.deleteVersion(removed.id);
        if (extended) {
          await repository.endVersion(extended.id, removed.endDate);
        } else if (policy.versions.length === 1) {
          await repository.deletePolicy(policy.id);
        }
        await appendTermsHistory(ctx, tx, policy, rulesValue(removed), null);
        await timeOff.ensureAllowances(ctx, tx, {
          employeeIds: reached.map(({ id }) => id),
          cause: rulesChanged(policy.id, removed.startDate!),
        });
        const saved = (await repository.findAll()).find(({ id }) => id === policy.id) ?? null;
        return { policy, saved };
      });
      logger.info(
        {
          timeOffPolicyId: policy.id,
          termsId: policy.termsId,
          timeOffTypeId: policy.timeOffType.id,
          startDate: input.startDate,
        },
        "Cancelled a time off policy change",
      );
      return saved;
    },

    async readPolicyReach(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const from = parseDateField("from", input.from);
      return transact(async (tx) => {
        const policy = existingPolicy(
          await timeOffPolicyRepository(tx).findAll(),
          input.timeOffPolicyId,
        );
        return reachOf(tx, policy, from);
      });
    },

    async readOfferReach(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const from = parseDateField("from", input.from);
      const termsId = parseUuid(input.termsId);
      return transact(async (tx) => {
        const timeOffType = existingType(
          await timeOffPolicyRepository(tx).findAllTypes(),
          input.timeOffTypeId,
        );
        return termsId ? readOfferReach(employeeReads, tx, termsId, timeOffType.id, from) : [];
      });
    },
  };
}

function rulesChanged(timeOffPolicyId: string, from: CalendarDate) {
  return { kind: "TIME_OFF_RULES_CHANGED" as const, ref: `${timeOffPolicyId}:${from}`, from };
}

function isTermsPolicy(policy: TimeOffPolicy, termsId: string, timeOffTypeId: string): boolean {
  return policy.termsId === termsId && policy.timeOffType.id === timeOffTypeId;
}

async function findPolicy(tx: Tx, timeOffPolicyId: string): Promise<TimeOffPolicy> {
  const policies = await timeOffPolicyRepository(tx).findAll();
  return policies.find(({ id }) => id === timeOffPolicyId)!;
}

/** The policy acted on; refuses one that does not exist with NOT_FOUND. */
function existingPolicy(
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
function existingType(types: readonly TimeOffType[], timeOffTypeId: string): TimeOffType {
  const type = types.find(({ id }) => id === parseUuid(timeOffTypeId));
  if (!type) {
    throw invalidInput([{ field: "timeOffTypeId", code: "not_found" }]);
  }
  return type;
}
