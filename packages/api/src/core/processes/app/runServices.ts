import type { CalendarDate } from "../../../utils";
import type { RecordTypeRegistry } from "../../records";
import { parseProcessDefinition, type TriggeringEvents } from "../domain";
import { createDueRunService } from "./dueRunService";
import { createEventRunService } from "./eventRunService";
import type { RegisteredActions } from "./processActions";
import type { ProcessServiceDependencies } from "./processService";
import { createRunEndings } from "./runEndings";
import { createRunLifecycleService } from "./runLifecycleService";
import { createRunReader } from "./runReader";
import { createRunStarter, type DefinitionReader, type ProcessRecordTypes } from "./runStarter";
import { createStepStarter } from "./stepStarter";

/** The services that start, follow and read runs, wired once for the process service. */
export function createRunServices(
  dependencies: ProcessServiceDependencies,
  today: () => CalendarDate,
) {
  const { people, triggeringEvents, actions } = dependencies;
  const recordTypes = processRecordTypesOf(dependencies.recordTypes);
  const definitionOf = definitionReader({ recordTypes, triggeringEvents, actions });
  const shared = { ...dependencies, recordTypes, definitionOf, today };
  const steps = createStepStarter(shared);
  const runEndings = createRunEndings(shared);
  const starter = createRunStarter({ people, recordTypes, steps, runEndings });
  const reader = createRunReader({ ...shared, stepStarter: steps });
  const lifecycle = createRunLifecycleService({ ...shared, starter, steps, runEndings });
  const dueRuns = createDueRunService({ ...shared, starter, lifecycle });
  const eventRuns = createEventRunService({ ...shared, starter });
  return { definitionOf, starter, reader, lifecycle, dueRuns, eventRuns };
}

/** The process capabilities of the record types that registered them, by type. */
function processRecordTypesOf(registry: RecordTypeRegistry): ProcessRecordTypes {
  return Object.fromEntries(
    Object.entries(registry).flatMap(([type, registration]) =>
      registration?.processes ? [[type, registration.processes]] : [],
    ),
  );
}

/** Parses stored definitions against the record types, events and actions the modules registered. */
function definitionReader({
  recordTypes,
  triggeringEvents,
  actions,
}: {
  recordTypes: ProcessRecordTypes;
  triggeringEvents: TriggeringEvents;
  actions: RegisteredActions;
}): DefinitionReader {
  const catalog = {
    recordTypes: Object.fromEntries(
      Object.entries(recordTypes).map(([type, { dateFields = [] }]) => [type, { dateFields }]),
    ),
    triggeringEvents,
    actions,
  };
  return ({ schemaVersion, definition }) =>
    parseProcessDefinition(schemaVersion, definition, catalog);
}
