import { ApplicationError } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid, todayInLondon } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import { createEmployeeReadService, createEmployeeWorkingPatternService } from "../../employees";
import { timeOffPolicyRepository } from "../db";
import type { AllowanceCause, TimeOffPolicy } from "../domain";
import { ensureAllowancesOf, type EnsuredAllowances } from "./allowanceEngine";

/** A policy as a list shows it. */
export type TimeOffPolicySummary = Pick<TimeOffPolicy, "id" | "name" | "key" | "balance"> & {
  typeKey: TimeOffPolicy["timeOffType"]["typeKey"];
};

/** Which time off policies groups get, and the engine that keeps each person's allowances. */
export interface TimeOffService {
  /**
   * Trusted, for operations that checked their caller, events and jobs: creates each employee's
   * allowance for the current leave year and appends the lines that bring every allowance whose
   * leave year has not ended to its target, in the caller's transaction. Missing employees are
   * skipped, and a repeat appends nothing.
   */
  ensureAllowances: (
    ctx: SecurityContext,
    tx: Tx,
    input: { employeeIds: readonly string[]; cause: AllowanceCause },
  ) => Promise<EnsuredAllowances>;
  /**
   * Gives a group each policy for its type from the beginning, then ensures its members'
   * allowances, in the caller's transaction. Refuses with CONFLICT a type the group already has.
   */
  linkGroupPolicies: (
    ctx: SecurityContext,
    tx: Tx,
    input: { policyGroupId: string; timeOffPolicyIds: readonly string[] },
  ) => Promise<EnsuredAllowances & { employeeCount: number }>;
  /** The policies linked to a group, on any date. */
  readGroupPolicies: (
    ctx: SecurityContext,
    input: { policyGroupId: string },
  ) => Promise<TimeOffPolicySummary[]>;
  /** Every policy, such as for finding a standard one by its key. */
  listPolicies: (ctx: SecurityContext, db: Orm | Tx) => Promise<TimeOffPolicySummary[]>;
  /** Unlinks every group's policies when setup or the demo goes back to its start. */
  deleteAllGroupPolicies: (ctx: SecurityContext, tx: Tx) => Promise<void>;
}

export function createTimeOffService({
  orm,
  transact,
  logger,
  bankHolidays,
  today = todayInLondon,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  bankHolidays: BankHolidayService;
  today?: () => CalendarDate;
}): TimeOffService {
  const dependencies = { orm, transact, logger };
  const engine = {
    employeeReads: createEmployeeReadService(dependencies),
    workingWeeks: createEmployeeWorkingPatternService(dependencies),
    bankHolidays,
    today,
  };
  const employeeReads = engine.employeeReads;
  const ensureAllowances: TimeOffService["ensureAllowances"] = (_ctx, tx, input) =>
    ensureAllowancesOf(engine, tx, input);
  return {
    ensureAllowances,
    async linkGroupPolicies(ctx, tx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const repository = timeOffPolicyRepository(tx);
      await repository.lockGroupLinks();
      const policyGroupId = parseUuid(input.policyGroupId);
      const employeeIds =
        policyGroupId && (await employeeReads.readPolicyGroupMemberIds(tx, policyGroupId));
      if (!policyGroupId || !employeeIds) {
        throw new ApplicationError("NOT_FOUND", "The policy group does not exist.");
      }
      const policies = await repository.findAll();
      const chosen = input.timeOffPolicyIds.map((id) => {
        const policy = policies.find((candidate) => candidate.id === parseUuid(id));
        if (!policy) {
          throw new ApplicationError("NOT_FOUND", "The time off policy does not exist.");
        }
        return policy;
      });
      const linked = (await repository.findGroupLinks([policyGroupId])).get(policyGroupId) ?? [];
      const typeIds = [
        ...linked.map(({ timeOffTypeId }) => timeOffTypeId),
        ...chosen.map(({ timeOffType }) => timeOffType.id),
      ];
      const conflict = chosen.find(
        ({ timeOffType }) => typeIds.indexOf(timeOffType.id) < typeIds.lastIndexOf(timeOffType.id),
      );
      if (conflict) {
        throw new ApplicationError(
          "CONFLICT",
          `The group already has a policy for ${conflict.timeOffType.name}.`,
        );
      }
      await repository.insertGroupLinks(
        policyGroupId,
        chosen.map(({ id, timeOffType }) => ({
          timeOffTypeId: timeOffType.id,
          timeOffPolicyId: id,
        })),
      );
      const ensured = await ensureAllowances(ctx, tx, {
        employeeIds,
        cause: { kind: "POLICY_LINKED_TO_GROUP", ref: policyGroupId },
      });
      return { employeeCount: employeeIds.length, ...ensured };
    },
    async readGroupPolicies(ctx, { policyGroupId }) {
      ctx.require("MANAGE_WORKSPACE");
      const groupId = parseUuid(policyGroupId);
      if (!groupId) {
        return [];
      }
      const repository = timeOffPolicyRepository(orm);
      const linked = (await repository.findGroupLinks([groupId])).get(groupId) ?? [];
      const ids = new Set(linked.map(({ timeOffPolicyId }) => timeOffPolicyId));
      return (await repository.findAll()).filter(({ id }) => ids.has(id)).map(toSummary);
    },
    async listPolicies(ctx, db) {
      ctx.require("MANAGE_WORKSPACE");
      return (await timeOffPolicyRepository(db).findAll()).map(toSummary);
    },
    async deleteAllGroupPolicies(ctx, tx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      await timeOffPolicyRepository(tx).deleteAllGroupLinks();
    },
  };
}

function toSummary({ id, name, key, balance, timeOffType }: TimeOffPolicy): TimeOffPolicySummary {
  return { id, name, key, balance, typeKey: timeOffType.typeKey };
}
