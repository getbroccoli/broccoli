import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import {
  allowanceEventHandlers,
  ensureAllowancesJob,
  type LeaveSetupService,
  type TimeOffService,
} from "./app";
import { createResolvers } from "./graphql";

// Public values.
export { createLeaveSetupService, createTimeOffService } from "./app";

// Public types.
export type {
  EmployeeTimeOffType,
  EnsuredAllowances,
  TimeOffPolicySummary,
  TimeOffService,
  TurnedOnLeave,
} from "./app";
export type { AllowanceCause, StandardLeavePolicyKey } from "./domain";

/** Time off: turning leave on, which policies terms get, and keeping each person's allowances as they change and every day. */
export function timeOffModule({
  timeOff,
  leaveSetup,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  timeOff: TimeOffService;
  leaveSetup: LeaveSetupService;
}): ModuleManifest {
  return {
    name: "timeOff",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(timeOff, leaveSetup),
    events: {
      ...allowanceEventHandlers({ timeOff, ...dependencies }),
      "timeOff.leave_turned_on": (turnedOn) =>
        Promise.resolve(dependencies.logger.info(turnedOn, "Turned leave on")),
    },
    jobs: ensureAllowancesJob({ timeOff, ...dependencies }),
  };
}
