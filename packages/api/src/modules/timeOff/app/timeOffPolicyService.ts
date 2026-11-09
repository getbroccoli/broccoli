import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, parseUuid, todayInLondon } from "../../../utils";
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
  type PolicyVersion,
  rulesValue,
  type TimeOffPolicy,
  type TimeOffRulesInput,
  versionFromRules,
} from "../domain";
import {
  addVersionFrom,
  appendTermsHistory,
  endPolicyFrom,
  existingPolicy,
  existingType,
  findPolicy,
  isTermsPolicy,
  plannedStop,
  stopValue,
} from "./policyChanges";
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
  /** Makes the version a planned stop ends open-ended again; returns the policy. */
  const cancelStop = async (
    ctx: SecurityContext,
    tx: Tx,
    policy: TimeOffPolicy,
    stopped: PolicyVersion,
  ) => {
    const stopDate = addDays(stopped.endDate!, 1);
    await timeOffPolicyRepository(tx).endVersion(stopped.id, null);
    await appendTermsHistory(ctx, tx, policy, stopValue(stopDate), null);
    const reopened = await findPolicy(tx, policy.id);
    await timeOff.ensureAllowances(ctx, tx, {
      employeeIds: (await reachOf(tx, reopened, stopDate)).map(({ id }) => id),
      cause: rulesChanged(policy.id, stopDate),
    });
    return reopened;
  };
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
        const { before, version } = await addVersionFrom(tx, policy, startDate, rules);
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
          return { policy, saved: await cancelStop(ctx, tx, policy, stopped) };
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
