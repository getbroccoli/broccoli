import { readSdl } from "../../core/graphql";
import { PrincipalSecurityContext } from "../../core/security";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { type ProcessService, startDueRunsJob } from "./app";

// Public values.
export { createProcessService } from "./app";

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
    eventsBeforeCommit: (tx, events) =>
      processes.startRunsOnEvents(PrincipalSecurityContext.system(), tx, events),
  };
}
