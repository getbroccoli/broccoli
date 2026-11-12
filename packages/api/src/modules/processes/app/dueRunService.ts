import { isUniqueViolation, type Orm, type Transact, type Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, dateInLondon } from "../../../utils";
import { processRepository, type StoredProcess } from "../db";
import { dueTriggerDate, parseProcessDefinition, type ProcessRun } from "../domain";
import type { RunLifecycleService } from "./runLifecycleService";
import type { RunStarter } from "./runStarter";

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

export function createDueRunService({
  orm,
  transact,
  logger,
  starter,
  lifecycle,
}: {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  starter: RunStarter;
  lifecycle: RunLifecycleService;
}): DueRunService {
  return {
    async startDueRuns(ctx, today) {
      ctx.requireSystem();
      let runsStarted = 0;
      for (const process of await processRepository(orm).listProcesses()) {
        if (!process.turnedOnAt) continue;
        const { activeVersion } = process;
        const definition = parseProcessDefinition(
          activeVersion.schemaVersion,
          activeVersion.definition,
        );
        const turnedOnDay = dateInLondon(process.turnedOnAt);
        const due = await transact((tx) => starter.findDue(tx, definition, { today, turnedOnDay }));
        const withRuns = await processRepository(orm).findRecordsWithRuns(
          process.id,
          "employee",
          due.map(({ employeeId }) => employeeId),
        );
        for (const { employeeId } of due) {
          if (
            !withRuns.has(employeeId) &&
            (await startOne({ transact, logger, starter }, process, employeeId, today))
          )
            runsStarted += 1;
        }
      }
      let runsCancelled = 0;
      for (const run of await processRepository(orm).listRunsInProgress()) {
        try {
          const checked = await transact(async (tx) =>
            lifecycle.cancelIfCannotRun(tx, (await processRepository(tx).lockRun(run.id))!),
          );
          if (checked.status !== "cancelled") continue;
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

/** Starts one record's run in its own transaction; logs a failure instead of throwing. */
async function startOne(
  { transact, logger, starter }: { transact: Transact; logger: Logger; starter: RunStarter },
  process: StoredProcess,
  employeeId: string,
  today: CalendarDate,
): Promise<ProcessRun | null> {
  try {
    const workspaceOwnerEmployeeId = await starter.readWorkspaceOwner();
    const run = await transact((tx) =>
      startIfStillDue(
        starter,
        tx,
        { processId: process.id, employeeId, today },
        workspaceOwnerEmployeeId,
      ),
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
    logger.error({ processKey: process.key, employeeId, reason }, "Process run not started");
    return null;
  }
}

/**
 * Starts the record's run once the process is locked, if the process is still on and the record is
 * still due and without a run: either may have changed since the pass looked.
 */
async function startIfStillDue(
  starter: RunStarter,
  tx: Tx,
  { processId, employeeId, today }: { processId: string; employeeId: string; today: CalendarDate },
  workspaceOwnerEmployeeId: string | null,
): Promise<ProcessRun | null> {
  const processes = processRepository(tx);
  await processes.lockProcess(processId);
  const [process] = await processes.findProcessesByIds([processId]);
  const subject = await starter.readSubject(tx, employeeId);
  if (!process?.turnedOnAt || !subject?.startDate) return null;
  const { activeVersion } = process;
  const definition = parseProcessDefinition(activeVersion.schemaVersion, activeVersion.definition);
  const triggerDate = dueTriggerDate(definition.trigger, subject.startDate, {
    today,
    turnedOnDay: dateInLondon(process.turnedOnAt),
  });
  const hasRun =
    (await processes.findRecordsWithRuns(processId, "employee", [employeeId])).size > 0;
  if (!triggerDate || hasRun) return null;
  return starter.start(tx, {
    process,
    definition,
    subject,
    startCause: "started_on_record_date",
    startedByEmployeeId: null,
    triggerDate,
    startKey: `on_record_date:employee:${employeeId}:${triggerDate}`,
    startDay: today,
    workspaceOwnerEmployeeId,
  });
}

function errorKind(error: unknown): string | undefined {
  return (error as Error | undefined)?.constructor?.name;
}
