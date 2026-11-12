import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { type ProcessService, startDueRunsJob } from "./app";

// Public values.
export { createProcessService } from "./app";

// Public types.
export type { ProcessService } from "./app";

/** Processes that give people tasks when something happens to a record, and their runs. */
export function processesModule({
  logger,
  processes,
}: Pick<ModuleDependencies, "logger"> & { processes: ProcessService }): ModuleManifest {
  return {
    name: "processes",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: {},
    jobs: startDueRunsJob({ processes, logger }),
  };
}
