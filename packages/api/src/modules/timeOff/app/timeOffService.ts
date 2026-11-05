import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { SetupTermsInput } from "../../../core/instance";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid, todayInLondon } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import {
  createEmployeeReadService,
  createEmployeeSetupService,
  createEmployeeWorkingPatternService,
  parseTermsSetup,
} from "../../employees";
import { timeOffPolicyRepository } from "../db";
import type { AllowanceCause, DatedPolicyRow, TimeOffPolicy } from "../domain";
import { ensureAllowancesOf, type EnsuredAllowances } from "./allowanceEngine";
import {
  listTimeOffTypes,
  readTimeOffTypeSettings,
  type TimeOffTypeList,
  type TimeOffTypeSettings,
} from "./timeOffTypeSettings";
import { type EmployeeTimeOffType, readTimeOffTypes } from "./readTimeOffTypes";

const employeeSetup = createEmployeeSetupService();

/** A policy as a list shows it. */
export type TimeOffPolicySummary = Pick<TimeOffPolicy, "id" | "name" | "key" | "balance"> & {
  typeKey: TimeOffPolicy["timeOffType"]["typeKey"];
};

/** Which time off policies terms get, and the engine that keeps each person's allowances. */
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
   * Gives terms each policy for its type from the beginning, then ensures their people's
   * allowances, in the caller's transaction. Refuses with CONFLICT a type the terms already have.
   */
  linkTermsPolicies: (
    ctx: SecurityContext,
    tx: Tx,
    input: { termsId: string; timeOffPolicyIds: readonly string[] },
  ) => Promise<EnsuredAllowances & { employeeCount: number }>;
  /**
   * Turns time off on, joining the caller's transaction: sets up each nation's terms on its working
   * week (`EmployeeSetupService.setUpTerms`), links each its Annual leave policy, one of the
   * standard ones, and the record-only policies, and ensures their people's allowances. Refuses
   * with CONFLICT once any terms have a time off policy.
   */
  turnOnTimeOff: (ctx: SecurityContext, tx: Tx, input: SetupTermsInput) => Promise<TurnedOnTimeOff>;
  /** The policies linked to terms, on any date. */
  readTermsPolicies: (
    ctx: SecurityContext,
    input: { termsId: string },
  ) => Promise<TimeOffPolicySummary[]>;
  /** Every policy, such as for finding a standard one by its key. */
  listPolicies: (ctx: SecurityContext, db: Orm | Tx) => Promise<TimeOffPolicySummary[]>;
  /**
   * Each employee's time off types for the leave year containing today, or their start when it
   * is later, by id, with their figures; ids outside the caller's time off scope are left out.
   */
  readTimeOffTypes: (
    ctx: SecurityContext,
    input: { employeeIds: readonly string[] },
  ) => Promise<Map<string, EmployeeTimeOffType[]>>;
  /** Every time off type for Settings, in list order, and how many people have time off. */
  listTimeOffTypes: (ctx: SecurityContext) => Promise<TimeOffTypeList>;
  /** One time off type for Settings, with its policies; null when there is none. */
  readTimeOffTypeSettings: (
    ctx: SecurityContext,
    input: { id: string },
  ) => Promise<TimeOffTypeSettings | null>;
  /** Unlinks all terms' policies when setup or the demo goes back to its start. */
  deleteAllTermsPolicies: (ctx: SecurityContext, tx: Tx) => Promise<void>;
}

/** What turning time off on did; the terms ids are in the order of the input's terms. */
export interface TurnedOnTimeOff extends EnsuredAllowances {
  termsIds: string[];
  createdPatternIds: string[];
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
    async linkTermsPolicies(ctx, tx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const repository = timeOffPolicyRepository(tx);
      await repository.lockTermsLinks();
      const termsId = parseUuid(input.termsId);
      const employeeIds = termsId && (await employeeReads.readTermsMemberIds(tx, termsId));
      if (!termsId || !employeeIds) {
        throw new ApplicationError("NOT_FOUND", "The terms do not exist.");
      }
      const policies = await repository.findAll();
      const chosen = input.timeOffPolicyIds.map((id) => {
        const policy = policies.find((candidate) => candidate.id === parseUuid(id));
        if (!policy) {
          throw new ApplicationError("NOT_FOUND", "The time off policy does not exist.");
        }
        return policy;
      });
      const linked = (await repository.findTermsLinks([termsId])).get(termsId) ?? [];
      const ensured = await linkPolicies(engine, tx, { termsId, employeeIds, chosen, linked });
      return { employeeCount: employeeIds.length, ...ensured };
    },
    async turnOnTimeOff(ctx, tx, input) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      const setup = parseTermsSetup(input);
      const repository = timeOffPolicyRepository(tx);
      await repository.lockTermsLinks();
      if (await repository.hasAnyTermsLinks()) {
        throw new ApplicationError("CONFLICT", "Time off is already on.");
      }
      const policies = await repository.findAll();
      const annualLeave = input.terms.map(({ annualLeavePolicyId }) => {
        const policy = policies.find(({ id }) => id === parseUuid(annualLeavePolicyId));
        if (!policy?.key) {
          throw invalidInput([{ field: "annualLeavePolicyId", code: "invalid" }]);
        }
        return policy;
      });
      const recordOnly = policies.filter(({ balance }) => balance === "no_balance");
      const setUp = await employeeSetup.setUpTerms(ctx, tx, setup);
      const totals = { allowancesCreated: 0, linesAppended: 0 };
      for (const [index, termsId] of setUp.termsIds.entries()) {
        // No terms had a policy when the lock was taken, so none has links to check against.
        const ensured = await linkPolicies(engine, tx, {
          termsId,
          employeeIds: setUp.memberIds[index]!,
          chosen: [annualLeave[index]!, ...recordOnly],
          linked: [],
        });
        totals.allowancesCreated += ensured.allowancesCreated;
        totals.linesAppended += ensured.linesAppended;
      }
      const turnedOn = {
        termsIds: setUp.termsIds,
        createdPatternIds: setUp.createdPatternIds,
        ...totals,
      };
      tx.publish("timeOff.time_off_turned_on", {
        ...turnedOn,
        timeOffPolicyIds: annualLeave.map(({ id }) => id),
        locationCount: input.locationTerms.length,
      });
      return turnedOn;
    },
    async readTermsPolicies(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const termsId = parseUuid(input.termsId);
      if (!termsId) {
        return [];
      }
      const repository = timeOffPolicyRepository(orm);
      const linked = (await repository.findTermsLinks([termsId])).get(termsId) ?? [];
      const ids = new Set(linked.map(({ timeOffPolicyId }) => timeOffPolicyId));
      return (await repository.findAll()).filter(({ id }) => ids.has(id)).map(toSummary);
    },
    async listPolicies(ctx, db) {
      ctx.require("MANAGE_WORKSPACE");
      return (await timeOffPolicyRepository(db).findAll()).map(toSummary);
    },
    readTimeOffTypes: (ctx, input) =>
      readTimeOffTypes({ transact, employeeReads, today }, ctx, input),
    listTimeOffTypes: (ctx) => listTimeOffTypes({ transact, employeeReads, today }, ctx),
    readTimeOffTypeSettings: (ctx, input) =>
      readTimeOffTypeSettings({ transact, employeeReads, today }, ctx, input),
    async deleteAllTermsPolicies(ctx, tx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      await timeOffPolicyRepository(tx).deleteAllTermsLinks();
    },
  };
}

/**
 * Links the chosen policies to the terms, which already have `linked`, under the caller's lock on
 * the links, and ensures their people's allowances.
 */
async function linkPolicies(
  engine: Parameters<typeof ensureAllowancesOf>[0],
  tx: Tx,
  {
    termsId,
    employeeIds,
    chosen,
    linked,
  }: {
    termsId: string;
    employeeIds: readonly string[];
    chosen: readonly TimeOffPolicy[];
    linked: readonly DatedPolicyRow[];
  },
): Promise<EnsuredAllowances> {
  const repository = timeOffPolicyRepository(tx);
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
      `The terms already have a policy for ${conflict.timeOffType.name}.`,
    );
  }
  await repository.insertTermsLinks(
    termsId,
    chosen.map(({ id, timeOffType }) => ({ timeOffTypeId: timeOffType.id, timeOffPolicyId: id })),
  );
  return ensureAllowancesOf(engine, tx, {
    employeeIds,
    cause: { kind: "POLICY_LINKED_TO_TERMS", ref: termsId },
  });
}

function toSummary({ id, name, key, balance, timeOffType }: TimeOffPolicy): TimeOffPolicySummary {
  return { id, name, key, balance, typeKey: timeOffType.typeKey };
}
