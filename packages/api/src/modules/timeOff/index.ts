import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { allowanceEventHandlers, ensureAllowancesJob, type TimeOffService } from "./app";
import { createResolvers } from "./graphql";

// Public values.
export { createTimeOffService } from "./app";

// Public types.
export type {
  EmployeeTimeOffType,
  EnsuredAllowances,
  TimeOffPolicySummary,
  TimeOffService,
} from "./app";
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
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(timeOff),
    events: allowanceEventHandlers({ timeOff, ...dependencies }),
    jobs: ensureAllowancesJob({ timeOff, ...dependencies }),
  };
}
