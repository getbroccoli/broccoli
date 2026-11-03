import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { allowanceEventHandlers, ensureAllowancesJob, type TimeOffService } from "./app";

// Public values.
export { createTimeOffService } from "./app";

// Public types.
export type { EnsuredAllowances, TimeOffPolicySummary, TimeOffService } from "./app";
export type { AllowanceCause, StandardLeavePolicyKey } from "./domain";

/** Time off: which policies terms get, and keeping each person's allowances as they change and every day. */
export function timeOffModule({
  timeOff,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  timeOff: TimeOffService;
}): ModuleManifest {
  return {
    name: "timeOff",
    typeDefs: "",
    resolvers: {},
    events: allowanceEventHandlers({ timeOff, ...dependencies }),
    jobs: ensureAllowancesJob({ timeOff, ...dependencies }),
  };
}
