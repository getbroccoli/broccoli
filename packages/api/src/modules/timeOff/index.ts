import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { allowanceEventHandlers, type TimeOffService } from "./app";

// Public values.
export { createTimeOffService } from "./app";

// Public types.
export type { EnsuredAllowances, TimeOffPolicySummary, TimeOffService } from "./app";
export type { AllowanceCause, StandardLeavePolicyKey } from "./domain";

/** Time off: which policies groups get, and keeping each person's allowances as they change. */
export function timeOffModule({
  timeOff,
  ...dependencies
}: Pick<ModuleDependencies, "transact" | "logger"> & { timeOff: TimeOffService }): ModuleManifest {
  return {
    name: "timeOff",
    typeDefs: "",
    resolvers: {},
    events: allowanceEventHandlers({ timeOff, ...dependencies }),
  };
}
