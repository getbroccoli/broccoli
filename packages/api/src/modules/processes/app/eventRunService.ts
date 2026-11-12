import type { Tx } from "../../../core/db";
import type { PublishedEvent } from "../../../core/events";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import type { CalendarDate } from "../../../utils";
import type { TaskService } from "../../tasks";
import { processRepository, type StoredProcess } from "../db";
import {
  type EventStart,
  isTriggeringEvent,
  matchEventStarts,
  parseProcessDefinition,
  type ProcessDefinition,
} from "../domain";
import type { RunStarter, RunSubject } from "./runStarter";

/** Starts the runs that a transaction's events trigger, inside that transaction. */
export interface EventRunService {
  /**
   * Trusted, as the system, before the commit: one run per turned-on process and record each event
   * triggers, skipping a record whose run of the process is in progress or that is gone. An error
   * rolls the transaction back.
   */
  startRunsOnEvents(ctx: SecurityContext, tx: Tx, events: readonly PublishedEvent[]): Promise<void>;
}

export function createEventRunService(dependencies: EventRunDependencies): EventRunService {
  return {
    async startRunsOnEvents(ctx, tx, events) {
      ctx.requireSystem();
      const triggering = events.filter(({ type }) => isTriggeringEvent(type));
      if (triggering.length === 0) return;
      const processes = await processRepository(tx).lockProcessesStartedBy([
        ...new Set(triggering.map(({ type }) => type)),
      ]);
      for (const process of processes) {
        await startRunsOf(dependencies, tx, process, triggering);
      }
    },
  };
}

interface EventRunDependencies {
  logger: Logger;
  tasks: TaskService;
  starter: RunStarter;
  /** Today in London: the start day of the runs. */
  today: () => CalendarDate;
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
    const { activeVersion } = process;
    const definition = parseProcessDefinition(
      activeVersion.schemaVersion,
      activeVersion.definition,
    );
    const starts = matchEventStarts(
      [{ processId: process.id, trigger: definition.trigger }],
      events,
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
  { logger, tasks, starter, today }: EventRunDependencies,
  tx: Tx,
  {
    process,
    definition,
    starts,
  }: { process: StoredProcess; definition: ProcessDefinition; starts: readonly Start[] },
): Promise<void> {
  const { recordType } = definition.subject;
  const subjects = await readRecordSubjects({ tasks, starter }, tx, recordType, starts);
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
        triggerEvent: event,
        startKey: `on_event:${event.id}:${recordId}`,
        startDay: today(),
      })),
    );
    if (started.length > 0) logStarted(logger, process, started, ready);
  }
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

/**
 * The subject of each record that still exists, by record id: the employee itself, or a task's
 * subject, null for a task about nobody.
 */
async function readRecordSubjects(
  { tasks, starter }: Pick<EventRunDependencies, "tasks" | "starter">,
  tx: Tx,
  recordType: ProcessDefinition["subject"]["recordType"],
  starts: readonly Start[],
): Promise<Map<string, RunSubject | null>> {
  const recordIds = [...new Set(starts.map(({ recordId }) => recordId))];
  if (recordType === "employee") return starter.readSubjects(tx, recordIds);
  const found = await tasks.readTasksInTransaction(tx, recordIds);
  const subjects = await starter.readSubjects(
    tx,
    found.flatMap(({ subjectEmployeeId }) => (subjectEmployeeId ? [subjectEmployeeId] : [])),
  );
  return new Map(
    found.map(({ id, subjectEmployeeId }) => [
      id,
      subjectEmployeeId ? (subjects.get(subjectEmployeeId) ?? null) : null,
    ]),
  );
}

/** The starts split so each record appears at most once a wave, keeping their order. */
function wavesOf(starts: readonly Start[]): Start[][] {
  const waves: Start[][] = [];
  for (const start of starts) {
    const wave = waves.find((candidate) =>
      candidate.every(({ recordId }) => recordId !== start.recordId),
    );
    if (wave) wave.push(start);
    else waves.push([start]);
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

function logStarted(
  logger: Logger,
  process: StoredProcess,
  runs: readonly { id: string }[],
  starts: readonly Start[],
): void {
  logger.info(
    {
      processKey: process.key,
      runIds: runs.map(({ id }) => id),
      eventIds: [...new Set(starts.map(({ event }) => event.id))],
    },
    "Process runs started with the change that triggered them",
  );
}
