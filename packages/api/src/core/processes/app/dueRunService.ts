import { isUniqueViolation, type Orm, type Transact, type Tx } from "../../db";
import type { Logger } from "../../logger";
import type { SecurityContext } from "../../security";
import { addDays, type CalendarDate, dateInLondon } from "../../../utils";
import { processRepository, runStepRepository, type StoredProcess } from "../db";
import type { TaskService } from "../../tasks";
import {
  dueTriggerDate,
  openTaskIdsOf,
  type ProcessRun,
  type ProcessRunFields,
  type RecordDateTrigger,
} from "../domain";
import type { RunLifecycleService } from "./runLifecycleService";
import type { DefinitionReader, ProcessRecordTypes, RunStarter } from "./runStarter";

/** Broccoli's daily pass over processes. */
export interface DueRunService {
  /**
   * Starts the runs whose record date has come and cancels runs in progress that can no longer run.
   * One run per transaction, so one failure stops no other.
   */
  startDueRuns(
    ctx: SecurityContext,
    today: CalendarDate,
  ): Promise<{ runsStarted: number; runsCancelled: number }>;
}

interface DueRunDependencies {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  tasks: TaskService;
  starter: RunStarter;
  lifecycle: RunLifecycleService;
  recordTypes: ProcessRecordTypes;
  definitionOf: DefinitionReader;
}

export function createDueRunService(dependencies: DueRunDependencies): DueRunService {
  const { orm, transact, logger, starter, definitionOf } = dependencies;
  return {
    async startDueRuns(ctx, today) {
      ctx.requireSystem();
      let runsStarted = 0;
      for (const process of await processRepository(orm).listProcesses()) {
        if (!process.turnedOnAt) continue;
        const { trigger } = definitionOf(process.activeVersion);
        if (trigger.kind !== "on_record_date") continue;
        const turnedOnDay = dateInLondon(process.turnedOnAt);
        const due = await transact((tx) => starter.findDue(tx, trigger, { today, turnedOnDay }));
        const withRuns = await processRepository(orm).findRecordsWithRuns(
          process.id,
          trigger.recordType,
          due.map(({ recordId }) => recordId),
        );
        for (const { recordId } of due) {
          if (!withRuns.has(recordId) && (await startOne(dependencies, process, recordId, today)))
            runsStarted += 1;
        }
      }
      let runsCancelled = 0;
      for (const run of await processRepository(orm).listRunsInProgress()) {
        try {
          const checked = await transact((tx) => checkRun(dependencies, tx, run.id));
          if (!checked) logger.info({ runId: run.id }, "Process run check left for the next pass");
          if (checked?.status !== "cancelled") continue;
          runsCancelled += 1;
          logger.info({ runId: run.id, cancelCause: checked.cancelCause }, "Process run cancelled");
        } catch (error) {
          logger.error({ runId: run.id, kind: errorKind(error) }, "Process run check failed");
        }
      }
      return { runsStarted, runsCancelled };
    },
  };
}

/**
 * Cancels the run if it can no longer run, taking its open tasks before the run, as a task's
 * change does; null when its open tasks changed meanwhile, left for the next pass.
 */
async function checkRun(
  { tasks, lifecycle }: DueRunDependencies,
  tx: Tx,
  runId: string,
): Promise<ProcessRun | null> {
  const runs = processRepository(tx);
  const locked = openTaskIdsOf(await runStepRepository(tx).findSteps(runId));
  await tasks.lockInTransaction(tx, locked);
  const run = (await runs.lockRun(runId))!;
  if (String(run.openTaskIds()) !== String(locked)) return null;
  return lifecycle.cancelIfCannotRun(tx, run);
}

/** Starts one record's run in its own transaction; logs a failure instead of throwing. */
async function startOne(
  dependencies: DueRunDependencies,
  process: StoredProcess,
  recordId: string,
  today: CalendarDate,
): Promise<ProcessRunFields | null> {
  const { transact, logger } = dependencies;
  try {
    const run = await transact((tx) =>
      startIfStillDue(dependencies, tx, { processId: process.id, recordId, today }),
    );
    if (run) {
      logger.info(
        { runId: run.id, processKey: process.key, startCause: run.startCause },
        "Process run started",
      );
    }
    return run;
  } catch (error) {
    const reason = isUniqueViolation(error, "process_runs_start_key_unique")
      ? "already_started"
      : errorKind(error);
    logger.error({ processKey: process.key, recordId, reason }, "Process run not started");
    return null;
  }
}

/**
 * Starts the record's run once the process is locked, if the process is still on and the record is
 * still due and without a run: either may have changed since the pass looked.
 */
async function startIfStillDue(
  { starter, recordTypes, definitionOf }: DueRunDependencies,
  tx: Tx,
  { processId, recordId, today }: { processId: string; recordId: string; today: CalendarDate },
): Promise<ProcessRunFields | null> {
  const processes = processRepository(tx);
  await processes.lockProcess(processId);
  const [process] = await processes.findProcessesByIds([processId]);
  if (!process?.turnedOnAt) return null;
  const definition = definitionOf(process.activeVersion);
  const { trigger } = definition;
  if (trigger.kind !== "on_record_date") return null;
  const triggerDate = await stillDueOn(recordTypes, tx, trigger, recordId, {
    today,
    turnedOnDay: dateInLondon(process.turnedOnAt),
  });
  const subjects = await starter.readRecordSubjects(tx, trigger.recordType, [recordId]);
  const hasRun =
    (await processes.findRecordsWithRuns(processId, trigger.recordType, [recordId])).size > 0;
  if (!triggerDate || !subjects.has(recordId) || hasRun) return null;
  const [run] = await starter.startMany(tx, [
    {
      process,
      definition,
      record: { recordType: trigger.recordType, recordId },
      subject: subjects.get(recordId)!,
      startCause: "started_on_record_date",
      startedByEmployeeId: null,
      triggerDate,
      triggerEvent: null,
      startKey: `on_record_date:${trigger.recordType}:${recordId}:${triggerDate}`,
      startDay: today,
    },
  ]);
  return run!;
}

/** The trigger date of the record's date, read again, if it still triggers a run today. */
async function stillDueOn(
  recordTypes: ProcessRecordTypes,
  tx: Tx,
  trigger: RecordDateTrigger,
  recordId: string,
  days: { today: CalendarDate; turnedOnDay: CalendarDate },
): Promise<CalendarDate | null> {
  // A trigger's offset counts calendar days, so a date that triggers today lies in this window.
  const { amount } = trigger.offset;
  const dates = await recordTypes[trigger.recordType]!.findByDateBetween!(tx, {
    field: trigger.dateField,
    from: addDays(days.today, -amount - trigger.maxDaysLate),
    until: addDays(days.today, -amount),
  });
  const date = dates.get(recordId);
  return date ? dueTriggerDate(trigger, date, days) : null;
}

function errorKind(error: unknown): string | undefined {
  return (error as Error | undefined)?.constructor?.name;
}
