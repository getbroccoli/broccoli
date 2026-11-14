import type { Tx } from "../../db";
import type { PublishedEvent } from "../../events";
import type { Logger } from "../../logger";
import type { SecurityContext } from "../../security";
import type { CalendarDate } from "../../../utils";
import { processRepository, type StoredProcess } from "../db";
import {
  eventAboutRecord,
  type EventStart,
  matchEventStarts,
  type ProcessDefinition,
  type TriggeringEvents,
} from "../domain";
import type { RunSubject } from "./ports";
import type { DefinitionReader, RunStarter } from "./runStarter";

/** Starts the runs that a transaction's events trigger, inside that transaction. */
export interface EventRunService {
  /**
   * Trusted, as the system, before the commit: one run per turned-on process and record each event
   * triggers, skipping a record whose run of the process is in progress or that is gone. An error
   * rolls the transaction back.
   */
  startRunsOnEvents(ctx: SecurityContext, tx: Tx, events: readonly PublishedEvent[]): Promise<void>;
}

interface EventRunDependencies {
  logger: Logger;
  starter: RunStarter;
  triggeringEvents: TriggeringEvents;
  definitionOf: DefinitionReader;
  /** Today in London: the start day of the runs. */
  today: () => CalendarDate;
}

export function createEventRunService(dependencies: EventRunDependencies): EventRunService {
  return {
    async startRunsOnEvents(ctx, tx, events) {
      ctx.requireSystem();
      const triggering = events.filter(({ type }) =>
        Object.hasOwn(dependencies.triggeringEvents, type),
      );
      if (triggering.length === 0) return;
      const processes = await processRepository(tx).findProcessesStartedBy([
        ...new Set(triggering.map(({ type }) => type)),
      ]);
      for (const process of processes) {
        await startRunsOf(dependencies, tx, process, triggering);
      }
    },
  };
}

type Start = EventStart<PublishedEvent>;

/** Starts the runs one process's trigger matches; a failure is logged with the process and rethrown. */
async function startRunsOf(
  dependencies: EventRunDependencies,
  tx: Tx,
  process: StoredProcess,
  events: readonly PublishedEvent[],
): Promise<void> {
  try {
    const definition = dependencies.definitionOf(process.activeVersion);
    const starts = matchEventStarts(
      [{ processId: process.id, trigger: definition.trigger }],
      events,
      dependencies.triggeringEvents,
    );
    if (starts.length > 0)
      await startProcessRuns(dependencies, tx, { process, definition, starts });
  } catch (error) {
    dependencies.logger.error(
      {
        processKey: process.key,
        eventIds: events.map(({ id }) => id),
        kind: (error as Error | undefined)?.constructor?.name,
      },
      "Process runs not started, so the change that triggered them rolls back",
    );
    throw error;
  }
}

/**
 * Starts one process's runs in waves, each record at most once a wave, so a second event for a
 * record finds the first one's run when it is still in progress.
 */
async function startProcessRuns(
  { logger, starter, today, triggeringEvents }: EventRunDependencies,
  tx: Tx,
  {
    process,
    definition,
    starts,
  }: { process: StoredProcess; definition: ProcessDefinition; starts: readonly Start[] },
): Promise<void> {
  const { recordType } = definition.subject;
  const subjects = await starter.readRecordSubjects(
    tx,
    recordType,
    starts.map(({ recordId }) => recordId),
  );
  const runs = processRepository(tx);
  for (const wave of wavesOf(starts)) {
    const inProgress = await runs.findRecordsWithRunInProgress(
      process.id,
      recordType,
      wave.map(({ recordId }) => recordId),
    );
    const ready = wave.filter((start) => {
      const reason = skipReasonOf(start, { subjects, inProgress });
      if (reason) logSkip(logger, process, start, reason);
      return reason === null;
    });
    const started = await starter.startMany(
      tx,
      ready.map(({ event, recordId }) => ({
        process,
        definition,
        record: { recordType, recordId },
        subject: subjects.get(recordId) ?? null,
        startCause: "started_on_event",
        startedByEmployeeId: null,
        triggerDate: null,
        triggerEvent: eventAboutRecord(event, recordId, triggeringEvents),
        startKey: `on_event:${event.id}:${recordId}`,
        startDay: today(),
      })),
    );
    publishStarted(tx, process, started, ready);
  }
}

function publishStarted(
  tx: Tx,
  process: StoredProcess,
  started: readonly { id: string }[],
  ready: readonly Start[],
): void {
  if (started.length === 0) return;
  tx.publish("processes.runs_started_on_event", {
    processKey: process.key,
    runIds: started.map(({ id }) => id),
    eventIds: [...new Set(ready.map(({ event }) => event.id))],
  });
}

/** Why a start is skipped: its record is gone or already has a run of the process in progress. */
function skipReasonOf(
  { recordId }: Start,
  {
    subjects,
    inProgress,
  }: { subjects: ReadonlyMap<string, RunSubject | null>; inProgress: ReadonlySet<string> },
): "record_gone" | "run_in_progress" | null {
  if (!subjects.has(recordId)) return "record_gone";
  return inProgress.has(recordId) ? "run_in_progress" : null;
}

/** The starts split so each record appears at most once a wave, keeping their order. */
function wavesOf(starts: readonly Start[]): Start[][] {
  const waves: Start[][] = [];
  const seen = new Map<string, number>();
  for (const start of starts) {
    const wave = seen.get(start.recordId) ?? 0;
    seen.set(start.recordId, wave + 1);
    (waves[wave] ??= []).push(start);
  }
  return waves;
}

function logSkip(
  logger: Logger,
  process: StoredProcess,
  { event, recordId }: Start,
  reason: "record_gone" | "run_in_progress",
): void {
  logger.info(
    { processKey: process.key, eventId: event.id, eventType: event.type, recordId, reason },
    "Process run not started for an event",
  );
}
