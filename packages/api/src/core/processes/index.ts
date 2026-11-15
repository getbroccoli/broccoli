import { readSdl } from "../graphql";
import { PrincipalSecurityContext } from "../security";
import type { ModuleDependencies, ModuleManifest } from "../moduleManifest";
import { type ProcessService, startDueRunsJob } from "./app";
import { createResolvers } from "./graphql";

// Public values.
export { createProcessService, PROCESS_STEP_TO_DO } from "./app";
export { type IsWorkingDay, MAX_SEARCH_DAYS, workingDaysOf } from "./domain";

// Public types.
export type { ProcessService } from "./app";
export type { PeoplePort, RunSubject, WorkingCalendarsPort } from "./ports";
export type { TriggeringEventRegistration, TriggeringEvents } from "./domain";

/** Processes that give people tasks when something happens to a record, and their runs. */
export function processesModule({
  logger,
  processes,
}: Pick<ModuleDependencies, "logger"> & { processes: ProcessService }): ModuleManifest {
  return {
    name: "processes",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(processes),
    jobs: startDueRunsJob({ processes, logger }),
    events: {
      // Logged once the change commits, never for runs a rollback dropped.
      "processes.runs_started_on_event": (started) =>
        Promise.resolve(
          logger.info(started, "Process runs started with the change that triggered them"),
        ),
      "processes.steps_completed": (completed) =>
        Promise.resolve(logger.info(completed, "Process step done")),
    },
    // A run follows its done tasks first, so the events that start runs see it settled.
    eventsBeforeCommit: async (tx, events) => {
      await processes.completeStepsOfDoneTasks(tx, events);
      await processes.startRunsOnEvents(PrincipalSecurityContext.system(), tx, events);
    },
  };
}
