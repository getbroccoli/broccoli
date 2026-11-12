import { isUniqueViolation } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, dateInLondon } from "../../../utils";
import { processRepository, type StoredProcess } from "../db";
import type { ProcessDefinition, ProcessRun } from "../domain";
import { type Deps, definitionOf } from "./processReads";

/**
 * Starts the runs of every process that is on whose trigger date has come, for records with no run
 * of it yet, one transaction each so one failure stops no other. Returns how many started.
 */
export async function startDue(
  deps: Deps,
  ctx: SecurityContext,
  today: CalendarDate,
  logger: Logger,
): Promise<number> {
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
    for (const { employeeId, triggerDate } of due) {
      if (withRuns.has(employeeId)) continue;
      const run = await startOne(
        deps,
        ctx,
        { process, definition, employeeId, triggerDate, today },
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

/** Starts one record's run under the process's lock, unless it got one meanwhile; logs instead of throwing. */
async function startOne(
  { transact, starter }: Deps,
  ctx: SecurityContext,
  due: {
    process: StoredProcess;
    definition: ProcessDefinition;
    employeeId: string;
    triggerDate: CalendarDate;
    today: CalendarDate;
  },
  logger: Logger,
): Promise<ProcessRun | null> {
  const { process, definition, employeeId, triggerDate, today } = due;
  try {
    const run = await transact(async (tx) => {
      const processes = processRepository(tx);
      await processes.lockProcess(process.id);
      const hasRun =
        (await processes.findRecordsWithRuns(process.id, "employee", [employeeId])).size > 0;
      const subject = await starter.readSubject(tx, employeeId);
      if (hasRun || !subject) return null;
      return starter.start(ctx, tx, {
        process,
        definition,
        subject,
        startCause: "started_on_record_date",
        startedByEmployeeId: null,
        triggerDate,
        startKey: `on_record_date:employee:${employeeId}:${triggerDate}`,
        startDay: today,
      });
    });
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
