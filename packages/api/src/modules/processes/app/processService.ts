import { ApplicationError, invalidInput } from "../../../core/applicationError";
import { type Tx } from "../../../core/db";
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
import { processRepository } from "../db";
import { completeStep, reopenStep as reopenedStep } from "../domain";
import { processRecordType } from "./processRecordType";
import {
  type Deps,
  definitionOf,
  type Process,
  type ProcessRun,
  type ProcessRunDetails,
  readDetails,
  requireProcess,
  requireRun,
  runIdOf,
  type StepChange,
  type StepProgress,
  subjectOf,
  toProcess,
  toRunView,
} from "./processReads";
import { cancel, cancelIfCannotRun, changeStep } from "./runChanges";
import { errorKind, startDue } from "./dueRuns";
import { createRunStarter } from "./runStarter";

/** A process as admins see it. */
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
  const historyReader = createRecordHistoryReaderService(orm, { process: processRecordType(orm) });
  const deps: Deps = { orm, transact, tasks, starter, now };

  const service: ProcessService = {
    async listProcesses(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      return (await processRepository(orm).listProcesses()).map(toProcess);
    },

    async turnOn(ctx, processKey) {
      const process = await switchProcess(deps, ctx, processKey, true);
      logger.info({ processKey }, "Process turned on");
      const started = await service.startDueRuns(PrincipalSecurityContext.system(), today());
      logger.info({ processKey, ...started }, "Due runs checked on turning a process on");
      return process;
    },

    async turnOff(ctx, processKey) {
      const process = await switchProcess(deps, ctx, processKey, false);
      logger.info({ processKey }, "Process turned off");
      return process;
    },

    async readProcessHistory(ctx, processKey, args) {
      ctx.require("MANAGE_WORKSPACE");
      const process = await requireProcess(orm, processKey);
      return historyReader.readHistory(ctx, "process", process.id, args);
    },

    async startRun(ctx, { processKey, employeeId }) {
      const process = await requireProcess(orm, processKey);
      const definition = definitionOf(process);
      const subjectId = parseUuid(employeeId);
      if (!subjectId) throw employeeNotFound();
      await ctx.requireInScope("process_run", "create", subjectId);
      if (!definition.startableByAdmin) {
        throw new ApplicationError("FORBIDDEN", "This process starts only by itself.");
      }
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
        return starter.start(ctx, tx, {
          process,
          definition,
          subject,
          startCause: "started_by_admin",
          startedByEmployeeId: ctx.user?.employeeId ?? null,
          triggerDate: null,
          startKey: null,
          startDay,
        });
      });
      logger.info({ runId: run.id, processKey, startCause: run.startCause }, "Process run started");
      return readDetails(deps, run);
    },

    async cancelRun(ctx, runId, reason) {
      const trimmed = reason.trim();
      if (!trimmed) throw invalidInput([{ field: "reason", code: "required" }]);
      const found = await requireRun(orm, runId);
      await ctx.requireInScope("process_run", "update", subjectOf(found));
      const run = await transact(async (tx) => {
        const locked = (await processRepository(tx).lockRun(found.id))!;
        return cancel(deps, ctx, tx, locked, {
          cause: "cancelled_by_admin",
          runReason: trimmed,
          taskReason: trimmed,
          byEmployeeId: ctx.user?.employeeId ?? null,
        });
      });
      logger.info({ runId: run.id, cancelCause: run.cancelCause }, "Process run cancelled");
      return readDetails(deps, run);
    },

    async readRun(ctx, runId) {
      const run = await requireRun(orm, runId);
      await ctx.requireInScope("process_run", "read", subjectOf(run));
      return readDetails(deps, run);
    },

    async listRuns(ctx, processKey) {
      const process = await requireProcess(orm, processKey);
      const scope = await ctx.recordScope("process_run", "read");
      const runs = await processRepository(orm).listRuns(process.id, scope);
      return runs.map((run) => toRunView(run, process));
    },

    async markStepDone(ctx, taskId) {
      const change = await changeStep(deps, ctx, taskId, async (tx, run, step) => {
        const task = await tasks.markDoneInTransaction(ctx, tx, taskId);
        return { task, step: completeStep(run, step, task.doneAt!) };
      });
      logger.info(
        { runId: change.run.id, taskId, runStatus: change.run.status },
        "Process step done",
      );
      return change;
    },

    async reopenStep(ctx, taskId) {
      const change = await changeStep(deps, ctx, taskId, async (tx, run, step, process) => {
        const newer = await processRepository(tx).findRunInProgress(
          run.processId,
          run.recordType,
          run.recordId,
        );
        const subject = run.subjectEmployeeId
          ? await starter.readSubject(tx, run.subjectEmployeeId)
          : null;
        const reopened = reopenedStep(run, step, {
          processName: process.name,
          subjectFirstName: subject?.firstName ?? "",
          isSuperseded: newer !== null && newer.id !== run.id,
        });
        return { task: await tasks.reopenInTransaction(ctx, tx, taskId), step: reopened };
      });
      logger.info(
        { runId: change.run.id, taskId, runStatus: change.run.status },
        "Process step reopened",
      );
      return change;
    },

    async readStepProgress(ctx, taskId) {
      const task = await tasks.readTask(ctx, taskId);
      const run = await requireRun(orm, runIdOf(task));
      const [process] = await processRepository(orm).findProcessesByIds([run.processId]);
      const steps = (await processRepository(orm).findSteps(run.id)).filter(
        ({ status }) => status !== "step_skipped",
      );
      return {
        processName: process!.name,
        subjectEmployeeId: run.subjectEmployeeId,
        status: run.status,
        doneSteps: steps.filter(({ status }) => status === "step_completed").length,
        totalSteps: steps.length,
      };
    },

    async startDueRuns(ctx, day) {
      ctx.requireSystem();
      const runsStarted = await startDue(deps, ctx, day, logger);
      let runsCancelled = 0;
      for (const run of await processRepository(orm).listRunsInProgress()) {
        try {
          const checked = await transact(async (tx) => {
            const locked = (await processRepository(tx).lockRun(run.id))!;
            return cancelIfCannotRun(deps, ctx, tx, locked);
          });
          if (checked.status === "cancelled") {
            runsCancelled += 1;
            logger.info(
              { runId: run.id, cancelCause: checked.cancelCause },
              "Process run cancelled",
            );
          }
        } catch (error) {
          logger.error({ runId: run.id, kind: errorKind(error) }, "Process run check failed");
        }
      }
      return { runsStarted, runsCancelled };
    },

    async resetProcesses(ctx, tx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      await processRepository(tx).reset();
      await history.purge(tx, "process");
    },
  };
  return service;
}

async function switchProcess(
  { transact, now }: Deps,
  ctx: SecurityContext,
  processKey: string,
  on: boolean,
): Promise<Process> {
  ctx.require("MANAGE_WORKSPACE");
  return transact(async (tx) => {
    const processes = processRepository(tx);
    const process = await requireProcess(tx, processKey);
    await processes.lockProcess(process.id);
    const wasOn = (await requireProcess(tx, processKey)).turnedOnAt !== null;
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
    return toProcess(await requireProcess(tx, processKey));
  });
}

function laterOf(day: CalendarDate, other: CalendarDate | null): CalendarDate {
  return other !== null && other > day ? other : day;
}

function employeeNotFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "No employee has this id.");
}

const history = createRecordHistoryService();
