import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import type { BankHolidayService } from "../bankHolidays";
import {
  allowanceEventHandlers,
  createAllowanceService,
  createBookTimeOffService,
  createOwnTimeOffRulesService,
  createTimeOffPolicyService,
  createWhosOutService,
  ensureAllowancesJob,
  type TimeOffSetupService,
  type TimeOffService,
} from "./app";
import { createEmployeeReadService } from "../employees";
import { createResolvers } from "./graphql";

// Public values.
export {
  createAllowanceService,
  createBookTimeOffService,
  createOwnTimeOffRulesService,
  createTimeOffPolicyService,
  createTimeOffSetupService,
  createTimeOffService,
  createWhosOutService,
} from "./app";

// Public types.
export type {
  EmployeeTimeOffType,
  EnsuredAllowances,
  TimeOffPolicyService,
  TimeOffService,
  TurnedOnTimeOff,
} from "./app";
export type { AllowanceCause, StandardLeavePolicyKey } from "./domain";

/** Time off: turning time off on, which policies terms get, and keeping each person's allowances as they change and every day. */
export function timeOffModule({
  timeOff,
  timeOffSetup,
  bankHolidays,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  timeOff: TimeOffService;
  timeOffSetup: TimeOffSetupService;
  bankHolidays: BankHolidayService;
}): ModuleManifest {
  return {
    name: "timeOff",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers({
      timeOff,
      timeOffSetup,
      policies: createTimeOffPolicyService({ ...dependencies, timeOff }),
      booking: createBookTimeOffService({ ...dependencies, timeOff, bankHolidays }),
      whosOut: createWhosOutService({ ...dependencies, bankHolidays }),
      ownRules: {
        ownRules: createOwnTimeOffRulesService({ ...dependencies, timeOff }),
        employees: createEmployeeReadService(dependencies),
      },
      allowances: createAllowanceService(dependencies),
    }),
    events: {
      ...allowanceEventHandlers({ timeOff, ...dependencies }),
      "timeOff.time_off_turned_on": (turnedOn) =>
        Promise.resolve(dependencies.logger.info(turnedOn, "Turned time off on")),
    },
    jobs: ensureAllowancesJob({ timeOff, ...dependencies }),
  };
}
