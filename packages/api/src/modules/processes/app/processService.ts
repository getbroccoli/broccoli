import { ApplicationError } from "../../../core/applicationError";
import type { Transact, Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { Connection, PageArgs } from "../../../core/pagination";
import {
  createRecordHistoryReaderService,
  createRecordHistoryService,
  type HistoryLine,
} from "../../../core/records";
import { PrincipalSecurityContext, type SecurityContext } from "../../../core/security";
import { type CalendarDate, dateInLondon, parseUuid } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import type { TaskService } from "../../tasks";
import { processRepository, type StoredProcess } from "../db";
import { parseProcessDefinition } from "../domain";
import { createDueRunService } from "./dueRunService";
import { processRecordType } from "./processRecordType";
import type {
  Process,
  ProcessRun,
  ProcessRunDetails,
  StepChange,
  StepProgress,
} from "./processViews";
import { createRunLifecycleService } from "./runLifecycleService";
import { createRunReader, type RunReader } from "./runReader";
import { createRunStarter } from "./runStarter";

/**
 * Processes give people tasks when something happens to a record, and follow each run to its end.
 * Admins turn them on, start and cancel runs; a step's assignee finishes it through its task here.
 */
export interface ProcessService {
  /** Every process, for those who manage the workspace. */
  listProcesses(ctx: SecurityContext): Promise<Process[]>;
  /** Starts new runs automatically from now on, beginning with today's; already on changes nothing. */
  turnOn(ctx: SecurityContext, processKey: string): Promise<Process>;
  /** Stops new automatic runs; runs in progress keep going. */
  turnOff(ctx: SecurityContext, processKey: string): Promise<Process>;
  /** A process's history, newest first, for those who manage the workspace. */
  readProcessHistory(
    ctx: SecurityContext,
    processKey: string,
    args: PageArgs,
  ): Promise<Connection<HistoryLine>>;
  /** An admin starts the process for one person by hand, whether it is on or off. */
  startRun(
    ctx: SecurityContext,
    input: { processKey: string; employeeId: string },
  ): Promise<ProcessRunDetails>;
  /** Cancels a run in progress: its open tasks are cancelled with the reason, done steps stay done. */
  cancelRun(ctx: SecurityContext, runId: string, reason: string): Promise<ProcessRunDetails>;
  readRun(ctx: SecurityContext, runId: string): Promise<ProcessRunDetails>;
  /** The process's runs the caller may read, newest first. */
  listRuns(ctx: SecurityContext, processKey: string): Promise<ProcessRun[]>;
  /** The assignee marks their step's task done; the run finishes when every step is done. */
  markStepDone(ctx: SecurityContext, taskId: string): Promise<StepChange>;
  /** The assignee takes their step's done task back to do; a finished run goes back in progress. */
  reopenStep(ctx: SecurityContext, taskId: string): Promise<StepChange>;
  /** The run behind a task its assignee or asker reads, as counts. */
  readStepProgress(ctx: SecurityContext, taskId: string): Promise<StepProgress>;
  /**
   * Broccoli's daily pass: starts the runs whose record date has come and cancels runs in
   * progress that can no longer run. One run per transaction, so one failure stops no other.
   */
  startDueRuns(
    ctx: SecurityContext,
    today: CalendarDate,
  ): Promise<{ runsStarted: number; runsCancelled: number }>;
  /**
   * Trusted, for resets: locks every process until the transaction ends, before anything a step
   * command locks after its process, so a reset and a step command take turns.
   */
  lockProcesses(ctx: SecurityContext, tx: Tx): Promise<void>;
  /** Back to a fresh workspace: deletes every run with its tasks, turns every process off, forgets their history. */
  resetProcesses(ctx: SecurityContext, tx: Tx): Promise<void>;
}

export function createProcessService({
  orm,
  transact,
  logger,
  tasks,
  bankHolidays,
  now = () => new Date(),
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  tasks: TaskService;
  bankHolidays: BankHolidayService;
  /** The clock: when a process is turned on, and from it today in London. */
  now?: () => Date;
}): ProcessService {
  const today = () => dateInLondon(now());
  const starter = createRunStarter({ orm, transact, tasks, bankHolidays });
  const reader = createRunReader({ transact, tasks, starter });
  const lifecycle = createRunLifecycleService({ orm, transact, logger, tasks, starter, reader });
  const dueRuns = createDueRunService({ orm, transact, logger, starter, lifecycle });
  const historyReader = createRecordHistoryReaderService(orm, { process: processRecordType(orm) });

  return {
    async listProcesses(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      return (await processRepository(orm).listProcesses()).map(processView);
    },

    async turnOn(ctx, processKey) {
      const process = await switchProcess({ transact, now, reader }, ctx, processKey, true);
      logger.info({ processKey }, "Process turned on");
      const started = await dueRuns.startDueRuns(PrincipalSecurityContext.system(), today());
      logger.info({ processKey, ...started }, "Due runs checked on turning a process on");
      return process;
    },

    async turnOff(ctx, processKey) {
      const process = await switchProcess({ transact, now, reader }, ctx, processKey, false);
      logger.info({ processKey }, "Process turned off");
      return process;
    },

    async readProcessHistory(ctx, processKey, args) {
      ctx.require("MANAGE_WORKSPACE");
      const process = await reader.requireProcess(orm, processKey);
      return historyReader.readHistory(ctx, "process", process.id, args);
    },

    async startRun(ctx, { processKey, employeeId }) {
      const process = await reader.requireProcess(orm, processKey);
      const { activeVersion } = process;
      const definition = parseProcessDefinition(
        activeVersion.schemaVersion,
        activeVersion.definition,
      );
      const subjectId = parseUuid(employeeId);
      if (!subjectId) throw employeeNotFound();
      await ctx.requireInScope("process_run", "create", subjectId);
      if (!definition.startableByAdmin) {
        throw new ApplicationError("FORBIDDEN", "This process starts only by itself.");
      }
      const workspaceOwnerEmployeeId = await starter.readWorkspaceOwner();
      const run = await transact(async (tx) => {
        await processRepository(tx).lockProcess(process.id);
        const subject = await starter.readSubject(tx, subjectId);
        if (!subject) throw employeeNotFound();
        if (await processRepository(tx).findRunInProgress(process.id, "employee", subjectId)) {
          throw new ApplicationError(
            "CONFLICT",
            `${process.name} is already running for ${subject.firstName}.`,
          );
        }
        const startDay = laterOf(today(), subject.startDate);
        return starter.start(tx, {
          process,
          definition,
          subject,
          startCause: "started_by_admin",
          startedByEmployeeId: ctx.user?.employeeId ?? null,
          triggerDate: null,
          startKey: null,
          startDay,
          workspaceOwnerEmployeeId,
        });
      });
      logger.info({ runId: run.id, processKey, startCause: run.startCause }, "Process run started");
      return reader.readDetails(run);
    },

    cancelRun: (ctx, runId, reason) => lifecycle.cancelRun(ctx, runId, reason),

    async readRun(ctx, runId) {
      const run = await reader.requireRun(orm, runId);
      await ctx.requireInScope("process_run", "read", run.subjectEmployeeId ?? "public");
      return reader.readDetails(run);
    },

    async listRuns(ctx, processKey) {
      const process = await reader.requireProcess(orm, processKey);
      const scope = await ctx.recordScope("process_run", "read");
      const runs = await processRepository(orm).listRuns(process.id, scope);
      return runs.map((run) => reader.view(run, process));
    },

    markStepDone: (ctx, taskId) => lifecycle.markStepDone(ctx, taskId),

    reopenStep: (ctx, taskId) => lifecycle.reopenStep(ctx, taskId),

    readStepProgress: (ctx, taskId) => lifecycle.readStepProgress(ctx, taskId),

    startDueRuns: (ctx, day) => dueRuns.startDueRuns(ctx, day),

    async lockProcesses(ctx, tx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      await processRepository(tx).lockAllProcesses();
    },

    async resetProcesses(ctx, tx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      await processRepository(tx).reset();
      await history.purge(tx, "process");
    },
  };
}

async function switchProcess(
  { transact, now, reader }: { transact: Transact; now: () => Date; reader: RunReader },
  ctx: SecurityContext,
  processKey: string,
  on: boolean,
): Promise<Process> {
  ctx.require("MANAGE_WORKSPACE");
  return transact(async (tx) => {
    const processes = processRepository(tx);
    const process = await reader.requireProcess(tx, processKey);
    await processes.lockProcess(process.id);
    const wasOn = (await reader.requireProcess(tx, processKey)).turnedOnAt !== null;
    if (wasOn !== on) {
      await processes.setTurnedOnAt(process.id, on ? now() : null);
      await history.append(ctx, tx, {
        recordType: "process",
        operation: "UPDATED",
        cause: { kind: "EDITED_DIRECTLY" },
        records: [
          {
            recordId: process.id,
            changes: [{ field: "isOn", oldValue: String(wasOn), newValue: String(on) }],
          },
        ],
      });
    }
    return processView(await reader.requireProcess(tx, processKey));
  });
}

function processView({
  id,
  key,
  name,
  description,
  turnedOnAt,
  activeVersion,
}: StoredProcess): Process {
  return {
    id,
    key,
    name,
    description,
    isOn: turnedOnAt !== null,
    turnedOnAt,
    activeVersion: { id: activeVersion.id, version: activeVersion.version },
  };
}

function laterOf(day: CalendarDate, other: CalendarDate | null): CalendarDate {
  return other !== null && other > day ? other : day;
}

function employeeNotFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "No employee has this id.");
}

const history = createRecordHistoryService();
