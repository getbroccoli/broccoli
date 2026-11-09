import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { SetupTermsInput } from "../../../core/instance";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, todayInLondon } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import {
  type CopyTermsParts,
  createEmployeeReadService,
  createEmployeeSetupService,
  createEmployeeWorkingPatternService,
  earliestChangeDate,
  parseTermsSetup,
  type TermsSetup,
  type TermsMovePreview,
  versionsFromToday,
} from "../../employees";
import { timeOffPolicyRepository } from "../db";
import {
  type AllowanceCause,
  parseStandardLeavePolicyKey,
  RECORD_ONLY_POLICY,
  type StandardLeavePolicyKey,
  rulesOfVersion,
  STANDARD_LEAVE_POLICIES,
  type TimeOffType,
  type TimeOffTypeIdentityInput,
} from "../domain";
import { ensureAllowancesOf, type EnsuredAllowances } from "./allowanceEngine";
import { listTimeOffTypes, type TimeOffTypeList } from "./listTimeOffTypes";
import { readTermsTimeOff, type TimeOffWithPolicies } from "./readTermsTimeOff";
import { type PersonTimeOff, readPersonTimeOff } from "./readPersonTimeOff";
import { type EmployeeTimeOffType, readTimeOffTypes } from "./readTimeOffTypes";
import { changeType, createType, deleteType } from "./timeOffTypeIdentity";

const employeeSetup = createEmployeeSetupService();

/** Turning time off on for terms, what people have, and the engine that keeps their allowances. */
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
   * Turns time off on, joining the caller's transaction: sets up each nation's terms on its working
   * week (`EmployeeSetupService.setUpTerms`), gives each a copy of its standard Annual leave policy
   * and a record-only policy for every other type, makes the default nation's Annual leave policy
   * Annual leave's default rules, and ensures their people's allowances. Refuses
   * with CONFLICT once any terms have a time off policy.
   */
  turnOnTimeOff: (ctx: SecurityContext, tx: Tx, input: SetupTermsInput) => Promise<TurnedOnTimeOff>;
  /**
   * Each employee's time off types for the leave year containing today, or their start when it
   * is later, by id, with their figures; ids outside the caller's time off scope are left out.
   */
  readTimeOffTypes: (
    ctx: SecurityContext,
    input: { employeeIds: readonly string[] },
  ) => Promise<Map<string, EmployeeTimeOffType[]>>;
  /**
   * Each person's rules for every company time off type from today on, marked as their terms' or
   * their own, by id; with `move`, as they would be after it. Ids outside the caller's time off
   * scope are left out.
   */
  readPersonTimeOff: (
    ctx: SecurityContext,
    input: { employeeIds: readonly string[]; move?: TermsMovePreview; from?: CalendarDate },
  ) => Promise<Map<string, PersonTimeOff[]>>;
  /** Adds a company time off type; no terms offer it until they get rules for it. Admins only. */
  createType: (ctx: SecurityContext, input: TimeOffTypeIdentityInput) => Promise<TimeOffType>;
  /**
   * Changes a type's name, icon, colour, privacy and default rules, the same in every set of
   * terms; refuses a name another type has, ignoring case, and showing Sickness's reason. Terms
   * already offering the type keep their rules. Admins only.
   */
  changeType: (
    ctx: SecurityContext,
    input: TimeOffTypeIdentityInput & { id: string },
  ) => Promise<TimeOffType>;
  /**
   * Deletes a type with its rules on every terms, its exceptions and allowances; refuses one with
   * time off on record, whatever its status. Admins only.
   */
  deleteType: (ctx: SecurityContext, input: { id: string }) => Promise<void>;
  /** Every time off type for Settings, in list order, and how many people have time off. */
  listTimeOffTypes: (ctx: SecurityContext) => Promise<TimeOffTypeList>;
  /**
   * For each terms id asked: every time off type in list order with the terms' policy versions
   * covering today or later, oldest first; no versions: not offered. Admins only.
   */
  readTermsTimeOff: (
    ctx: SecurityContext,
    termsIds: readonly string[],
  ) => Promise<Map<string, TimeOffWithPolicies[]>>;
  /**
   * Holds back turning time off on until the caller's transaction ends. Going back to the start
   * takes it before deleting the employees, as turning time off on takes it before their rows.
   */
  lockPolicies: (ctx: SecurityContext, tx: Tx) => Promise<void>;
  /**
   * Back to a fresh workspace's time off when setup or the demo goes back to its start, after the
   * employees: deletes every policy and the company's own types, and restores the seeded types.
   */
  resetTimeOff: (ctx: SecurityContext, tx: Tx) => Promise<void>;
  /**
   * Gives cloned terms the source terms' rules for each type they offer: today's from the start of
   * the current leave year, then the planned ones. Admins only.
   */
  copyTermsPolicies: CopyTermsParts;
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
    workingWeeks: createEmployeeWorkingPatternService({ ...dependencies, today }),
    bankHolidays,
    today,
  };
  const employeeReads = engine.employeeReads;
  const ensureAllowances: TimeOffService["ensureAllowances"] = (_ctx, tx, input) =>
    ensureAllowancesOf(engine, tx, input);
  return {
    ensureAllowances,
    async turnOnTimeOff(ctx, tx, input) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      const setup = parseTermsSetup(input);
      const annualLeaveKeys = input.terms.map(({ annualLeavePolicyKey }) =>
        parseStandardLeavePolicyKey(annualLeavePolicyKey),
      );
      const repository = timeOffPolicyRepository(tx);
      await repository.lockPolicies();
      if (await repository.hasAnyTermsPolicies()) {
        throw new ApplicationError("CONFLICT", "Time off is already on.");
      }
      const types = await repository.findAllTypes();
      const setUp = await employeeSetup.setUpTerms(ctx, tx, setup);
      for (const [index, termsId] of setUp.termsIds.entries()) {
        for (const { id: timeOffTypeId, typeKey } of types) {
          const version =
            typeKey === "annual_leave"
              ? STANDARD_LEAVE_POLICIES[annualLeaveKeys[index]!]
              : RECORD_ONLY_POLICY;
          await repository.insertPolicy({ timeOffTypeId, termsId }, version);
        }
      }
      await setAnnualLeaveDefault(tx, types, annualLeaveKeys[defaultTermsIndex(setup)]!);
      const ensured = await ensureAllowancesOf(engine, tx, {
        employeeIds: setUp.memberIds.flat(),
        cause: { kind: "TIME_OFF_TURNED_ON", ref: null },
      });
      const turnedOn = {
        termsIds: setUp.termsIds,
        createdPatternIds: setUp.createdPatternIds,
        ...ensured,
      };
      tx.publish("timeOff.time_off_turned_on", {
        ...turnedOn,
        annualLeavePolicyKeys: annualLeaveKeys,
        locationCount: input.locationTerms.length,
      });
      return turnedOn;
    },
    readTimeOffTypes: (ctx, input) =>
      readTimeOffTypes({ transact, employeeReads, today }, ctx, input),
    readPersonTimeOff: (ctx, input) =>
      readPersonTimeOff({ transact, employeeReads, today }, ctx, input),
    createType: (ctx, input) => createType(dependencies, ctx, input),
    changeType: (ctx, input) => changeType(dependencies, ctx, input),
    deleteType: (ctx, input) => deleteType(dependencies, ctx, input),
    listTimeOffTypes: (ctx) => listTimeOffTypes({ transact, today }, ctx),
    readTermsTimeOff: (ctx, termsIds) => readTermsTimeOff({ orm, today }, ctx, termsIds),
    async lockPolicies(ctx, tx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      await timeOffPolicyRepository(tx).lockPolicies();
    },
    async resetTimeOff(ctx, tx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      await timeOffPolicyRepository(tx).deleteAll();
    },
    async copyTermsPolicies(ctx, tx, { fromTermsId, toTermsId }) {
      ctx.require("MANAGE_WORKSPACE");
      const repository = timeOffPolicyRepository(tx);
      // Held as every policy writer holds it, so no version changes between the reads below.
      await repository.lockPolicies();
      const date = today();
      const policies = await repository.findAll();
      for (const { termsId, timeOffType, versions } of policies) {
        // Every copied version has a start: today's starts at the start of the leave year.
        const [current, ...planned] = versionsFromToday(versions, date, earliestChangeDate(date));
        if (termsId !== fromTermsId || !current) {
          continue;
        }
        const policyId = await repository.insertPolicy(
          { timeOffTypeId: timeOffType.id, termsId: toTermsId },
          { ...current, startDate: current.startDate! },
        );
        for (const version of planned) {
          await repository.insertVersion(policyId, { ...version, startDate: version.startDate! });
        }
      }
    },
  };
}

/** Annual leave, unless it was deleted, offers the default nation's standard policy from now on. */
async function setAnnualLeaveDefault(
  tx: Tx,
  types: readonly TimeOffType[],
  key: StandardLeavePolicyKey,
): Promise<void> {
  const annualLeave = types.find(({ typeKey }) => typeKey === "annual_leave");
  if (annualLeave) {
    await timeOffPolicyRepository(tx).updateType(annualLeave.id, {
      defaultRules: rulesOfVersion(STANDARD_LEAVE_POLICIES[key]),
    });
  }
}

/** Where the default nation's terms are among the parsed setup's, which always has them. */
function defaultTermsIndex({ terms, defaultBankHolidayCalendar }: TermsSetup): number {
  return terms.findIndex(
    ({ bankHolidayCalendar }) => bankHolidayCalendar === defaultBankHolidayCalendar,
  );
}
