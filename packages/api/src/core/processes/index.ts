import { readSdl } from "../graphql";
import { PrincipalSecurityContext } from "../security";
import type { ModuleDependencies, ModuleManifest } from "../moduleManifest";
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
    events: {
      // Logged once the change commits, never for runs a rollback dropped.
      "processes.runs_started_on_event": (started) =>
        Promise.resolve(
          logger.info(started, "Process runs started with the change that triggered them"),
        ),
    },
    eventsBeforeCommit: (tx, events) =>
      processes.startRunsOnEvents(PrincipalSecurityContext.system(), tx, events),
  };
}
