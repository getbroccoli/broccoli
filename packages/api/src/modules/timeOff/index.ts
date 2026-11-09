import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import type { BankHolidayService } from "../bankHolidays";
import {
  allowanceEventHandlers,
  createTimeOffBookingService,
  createTimeOffPolicyService,
  ensureAllowancesJob,
  type TimeOffSetupService,
  type TimeOffService,
} from "./app";
import { createResolvers } from "./graphql";

// Public values.
export {
  createTimeOffBookingService,
  createTimeOffPolicyService,
  createTimeOffSetupService,
  createTimeOffService,
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
    resolvers: createResolvers(
      timeOff,
      timeOffSetup,
      createTimeOffPolicyService({ ...dependencies, timeOff }),
      createTimeOffBookingService({ ...dependencies, timeOff, bankHolidays }),
    ),
    events: {
      ...allowanceEventHandlers({ timeOff, ...dependencies }),
      "timeOff.time_off_turned_on": (turnedOn) =>
        Promise.resolve(dependencies.logger.info(turnedOn, "Turned time off on")),
    },
    jobs: ensureAllowancesJob({ timeOff, ...dependencies }),
  };
}
