import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { SetupTermsInput } from "../../../core/instance";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, todayInLondon } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import {
  createEmployeeReadService,
  createEmployeeSetupService,
  createEmployeeWorkingPatternService,
  parseTermsSetup,
} from "../../employees";
import { allowanceRepository, timeOffPolicyRepository } from "../db";
import {
  type AllowanceCause,
  parseStandardLeavePolicyKey,
  RECORD_ONLY_POLICY,
  STANDARD_LEAVE_POLICIES,
} from "../domain";
import { ensureAllowancesOf, type EnsuredAllowances } from "./allowanceEngine";
import { listTimeOffTypes, type TimeOffTypeList } from "./listTimeOffTypes";
import { type EmployeeTimeOffType, readTimeOffTypes } from "./readTimeOffTypes";

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
   * and a record-only policy for every other type, and ensures their people's allowances. Refuses
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
  /** Every time off type for Settings, in list order, and how many people have time off. */
  listTimeOffTypes: (ctx: SecurityContext) => Promise<TimeOffTypeList>;
  /**
   * Deletes every time off policy and allowance when setup or the demo goes back to its start,
   * before the employees, as turning time off on takes the policies before their rows.
   */
  deleteAllPolicies: (ctx: SecurityContext, tx: Tx) => Promise<void>;
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
    listTimeOffTypes: (ctx) => listTimeOffTypes({ transact, today }, ctx),
    async deleteAllPolicies(ctx, tx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      const repository = timeOffPolicyRepository(tx);
      await repository.lockPolicies();
      // Ledger lines point at the policies' rules, so the allowances go first.
      await allowanceRepository(tx).deleteAll();
      await repository.deleteAll();
    },
  };
}
