import type { Transact, Tx } from "../../db";
import type { PublishedEvent } from "../../events";
import type { JobQueue, Jobs } from "../../jobs";
import type { Logger } from "../../logger";
import type { SecurityContext } from "../../security";
import type { CalendarDate } from "../../../utils";
import { processRepository, type StoredProcess } from "../db";
import {
  eventAboutRecord,
  type EventStart,
  matchEventStarts,
  type ProcessDefinition,
  type TriggerEvent,
  type TriggeringEvents,
} from "../domain";
import type { RunSubject } from "../ports";
import type { DefinitionReader, RunStarter } from "./runStarter";

/** Starts the runs that a transaction's events trigger, inside it or after it commits. */
export interface EventRunService {
  /**
   * Trusted, as the system, before the commit: one run per turned-on in-transaction process and
   * record each event triggers, skipping a record whose run of the process is in progress or that
   * is gone; one job per after-commit process and event it triggers. An error rolls the
   * transaction back.
   */
  startRunsOnEvents(ctx: SecurityContext, tx: Tx, events: readonly PublishedEvent[]): Promise<void>;
  /**
   * Trusted, as the system, for an after-commit job, in its own transaction: the runs of the job's
   * process version for its event's records, unless the process is off, a record is gone, has a run
   * in progress or already had this event's run.
   */
  startRunsAfterCommit(ctx: SecurityContext, job: AfterCommitJob): Promise<void>;
}

/** What an after-commit job carries: one process version and the event that triggered it. */
export type AfterCommitJob = Jobs["processes.startRunsAfterCommit"];

interface EventRunDependencies {
  transact: Transact;
  jobs: JobQueue;
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

    async startRunsAfterCommit(ctx, job) {
      ctx.requireSystem();
      await dependencies.transact((tx) => startRunsOfJob(dependencies, tx, job), { hop: job.hop });
    },
  };
}

type Start = EventStart<TriggerEvent>;

/**
 * Starts the runs one process's trigger matches, or queues them after the commit; a failure is
 * logged with the process and rethrown.
 */
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
    if (starts.length === 0) return;
    if (definition.trigger.kind === "on_event" && definition.trigger.run === "after_commit") {
      await queueAfterCommit(dependencies, tx, process, starts);
    } else {
      await startProcessRuns(dependencies, tx, { process, definition, starts });
    }
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

/** How many after-commit jobs in a row may start more: a loop of processes beyond it is a bug. */
const MAX_AFTER_COMMIT_HOPS = 10;

/** One job per event, carrying the process's version; none past the hop limit, which is logged. */
async function queueAfterCommit(
  { jobs, logger }: EventRunDependencies,
  tx: Tx,
  process: StoredProcess,
  starts: readonly Start[],
): Promise<void> {
  const hop = tx.hop + 1;
  for (const [event, recordIds] of recordIdsByEvent(starts)) {
    const context = { processKey: process.key, eventId: event.id, eventType: event.type, hop };
    if (hop > MAX_AFTER_COMMIT_HOPS) {
      logger.error(
        context,
        `Process runs not queued: events kept starting processes after ${MAX_AFTER_COMMIT_HOPS} hops`,
      );
      continue;
    }
    const { id, type, payload } = event;
    await jobs.send(tx, "processes.startRunsAfterCommit", {
      processId: process.id,
      versionId: process.activeVersion.id,
      hop,
      event: { id, type, payload },
    });
    logger.info(
      { ...context, recordCount: recordIds.length },
      "Process runs queued to start after the change",
    );
  }
}

/**
 * The job's runs, once its process is locked so its jobs take turns: with the version it carries,
 * for the records of its event that have no run of it yet.
 */
async function startRunsOfJob(
  dependencies: EventRunDependencies,
  tx: Tx,
  { processId, versionId, event }: AfterCommitJob,
): Promise<void> {
  const runs = processRepository(tx);
  await runs.lockProcess(processId);
  const [current] = await runs.findProcessesByIds([processId]);
  if (!current?.turnedOnAt) {
    dependencies.logger.info(
      { processId, eventId: event.id, eventType: event.type, reason: "process_turned_off" },
      "Process run not started for an event",
    );
    return;
  }
  const process = { ...current, activeVersion: (await runs.findVersion(versionId))! };
  const definition = dependencies.definitionOf(process.activeVersion);
  const starts = matchEventStarts(
    [{ processId, trigger: definition.trigger }],
    [event],
    dependencies.triggeringEvents,
  );
  const taken = await runs.findRecordsWithStartKeys(
    processId,
    definition.subject.recordType,
    starts.map((start) => ({ recordId: start.recordId, startKey: startKeyOf(start) })),
  );
  const fresh = starts.filter((start) => {
    const isTaken = taken.has(start.recordId);
    if (isTaken) logSkip(dependencies.logger, process, start, "already_started");
    return !isTaken;
  });
  if (fresh.length > 0)
    await startProcessRuns(dependencies, tx, { process, definition, starts: fresh });
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
        startKey: startKeyOf({ event, recordId }),
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

type SkipReason = "record_gone" | "run_in_progress" | "already_started";

/** Why a start is skipped before its record's run starts. */
function skipReasonOf(
  { recordId }: Start,
  {
    subjects,
    inProgress,
  }: { subjects: ReadonlyMap<string, RunSubject | null>; inProgress: ReadonlySet<string> },
): SkipReason | null {
  if (!subjects.has(recordId)) return "record_gone";
  return inProgress.has(recordId) ? "run_in_progress" : null;
}

/** At most one run per process, event and record, however often the event is delivered. */
function startKeyOf({ event, recordId }: Pick<Start, "event" | "recordId">): string {
  return `on_event:${event.id}:${recordId}`;
}

/** Each event's record ids, in the order of the starts. */
function recordIdsByEvent(starts: readonly Start[]): Map<TriggerEvent, string[]> {
  const byEvent = new Map<TriggerEvent, string[]>();
  for (const { event, recordId } of starts) {
    byEvent.set(event, [...(byEvent.get(event) ?? []), recordId]);
  }
  return byEvent;
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
  reason: SkipReason,
): void {
  logger.info(
    { processKey: process.key, eventId: event.id, eventType: event.type, recordId, reason },
    "Process run not started for an event",
  );
}
