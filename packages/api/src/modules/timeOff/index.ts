import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import {
  allowanceEventHandlers,
  ensureAllowancesJob,
  timeOffTypeRecordType,
  type TimeOffSetupService,
  type TimeOffService,
} from "./app";
import { createResolvers } from "./graphql";

// Public values.
export { createTimeOffSetupService, createTimeOffService } from "./app";

// Public types.
export type {
  EmployeeTimeOffType,
  EnsuredAllowances,
  TimeOffPolicySummary,
  TimeOffService,
  TurnedOnTimeOff,
} from "./app";
export type { AllowanceCause, StandardLeavePolicyKey } from "./domain";

/** Time off: turning time off on, which policies terms get, and keeping each person's allowances as they change and every day. */
export function timeOffModule({
  timeOff,
  timeOffSetup,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  timeOff: TimeOffService;
  timeOffSetup: TimeOffSetupService;
}): ModuleManifest {
  return {
    name: "timeOff",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(timeOff, timeOffSetup),
    events: {
      ...allowanceEventHandlers({ timeOff, ...dependencies }),
      "timeOff.time_off_turned_on": (turnedOn) =>
        Promise.resolve(dependencies.logger.info(turnedOn, "Turned time off on")),
      "timeOff.time_off_type_saved": (saved) =>
        Promise.resolve(dependencies.logger.info(saved, "Saved a time off type")),
      "timeOff.time_off_type_deleted": (deleted) =>
        Promise.resolve(dependencies.logger.info(deleted, "Deleted a time off type")),
    },
    jobs: ensureAllowancesJob({ timeOff, ...dependencies }),
    recordTypes: { time_off_type: timeOffTypeRecordType(dependencies.orm) },
  };
}
