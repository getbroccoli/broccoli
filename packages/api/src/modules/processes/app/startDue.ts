import { isUniqueViolation, type Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import { type CalendarDate, dateInLondon } from "../../../utils";
import { processRepository } from "../db";
import { dueTriggerDate, type ProcessRun } from "../domain";
import { type Deps, definitionOf } from "./processRunDetails";

/**
 * Starts the runs of every process that is on whose trigger date has come, for records with no run
 * of it yet, one transaction each so one failure stops no other. Returns how many started.
 */
export async function startDue(deps: Deps, today: CalendarDate, logger: Logger): Promise<number> {
  const { orm, transact, starter } = deps;
  let started = 0;
  for (const process of await processRepository(orm).listProcesses()) {
    if (!process.turnedOnAt) continue;
    const definition = definitionOf(process);
    const turnedOnDay = dateInLondon(process.turnedOnAt);
    const due = await transact((tx) => starter.findDue(tx, definition, { today, turnedOnDay }));
    const withRuns = await processRepository(orm).findRecordsWithRuns(
      process.id,
      "employee",
      due.map(({ employeeId }) => employeeId),
    );
    for (const { employeeId } of due) {
      if (withRuns.has(employeeId)) continue;
      const run = await startOne(
        deps,
        { processId: process.id, processKey: process.key, employeeId, today },
        logger,
      );
      if (run) started += 1;
    }
  }
  return started;
}

export function errorKind(error: unknown): string | undefined {
  return (error as Error | undefined)?.constructor?.name;
}

/** Starts one record's run in its own transaction; logs a failure instead of throwing. */
async function startOne(
  { transact, starter }: Deps,
  { processId, processKey, employeeId, today }: DueRecord & { processKey: string },
  logger: Logger,
): Promise<ProcessRun | null> {
  try {
    const workspaceOwnerEmployeeId = await starter.readWorkspaceOwner();
    const run = await transact((tx) =>
      startIfStillDue(starter, tx, { processId, employeeId, today }, workspaceOwnerEmployeeId),
    );
    if (run) {
      logger.info({ runId: run.id, processKey, startCause: run.startCause }, "Process run started");
    }
    return run;
  } catch (error) {
    const reason = isUniqueViolation(error, "process_runs_start_key_unique")
      ? "already_started"
      : errorKind(error);
    logger.error({ processKey, employeeId, reason }, "Process run not started");
    return null;
  }
}

interface DueRecord {
  processId: string;
  employeeId: string;
  today: CalendarDate;
}

/**
 * Starts the record's run once the process is locked, if the process is still on and the record is
 * still due and without a run: either may have changed since the pass looked.
 */
async function startIfStillDue(
  starter: Deps["starter"],
  tx: Tx,
  { processId, employeeId, today }: DueRecord,
  workspaceOwnerEmployeeId: string | null,
): Promise<ProcessRun | null> {
  const processes = processRepository(tx);
  await processes.lockProcess(processId);
  const [process] = await processes.findProcessesByIds([processId]);
  const subject = await starter.readSubject(tx, employeeId);
  if (!process?.turnedOnAt || !subject?.startDate) return null;
  const definition = definitionOf(process);
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
