import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm, Transact, Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import { PrincipalSecurityContext, type SecurityContext } from "../../../core/security";
import type { Task, TaskService } from "../../tasks";
import { processRepository, type StoredProcess } from "../db";
import {
  type CancelCause,
  cancelRun,
  completeStep,
  PROCESS_CANCELLED,
  type ProcessRun as StoredRun,
  removalCancellation,
  reopenStep,
  type RunStep,
  settleRun,
  SUBJECT_REMOVED,
} from "../domain";
import type { ProcessRun, ProcessRunDetails, StepChange, StepProgress } from "./processViews";
import type { RunReader } from "./runReader";
import type { RunStarter } from "./runStarter";

/**
 * A run while it runs: its assignees finish and reopen their steps, admins cancel it, and it
 * cancels itself once its subject or a waiting step's assignee is gone.
 */
export interface RunLifecycleService {
  /** The assignee marks their step's task done; the run finishes when every step is done. */
  markStepDone(ctx: SecurityContext, taskId: string): Promise<StepChange>;
  /** The assignee takes their step's done task back to do; a finished run goes back in progress. */
  reopenStep(ctx: SecurityContext, taskId: string): Promise<StepChange>;
  /** The run behind a task its assignee or asker reads, as counts. */
  readStepProgress(ctx: SecurityContext, taskId: string): Promise<StepProgress>;
  /** An admin cancels a run in progress: its open tasks with the reason, done steps stay done. */
  cancelRun(ctx: SecurityContext, runId: string, reason: string): Promise<ProcessRunDetails>;
  /**
   * The locked run, cancelled and saved when its subject or a waiting step's assignee is gone;
   * else as it was. The run cancels itself, so Broccoli is the author, whoever's command noticed.
   */
  cancelIfCannotRun(tx: Tx, run: StoredRun): Promise<StoredRun>;
}

export function createRunLifecycleService({
  orm,
  transact,
  logger,
  tasks,
  starter,
  reader,
}: {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  tasks: TaskService;
  starter: RunStarter;
  reader: RunReader;
}): RunLifecycleService {
  const lifecycle: RunLifecycleService = {
    async markStepDone(ctx, taskId) {
      const change = await changeStep(stepDeps, ctx, taskId, async (tx, run, step) => {
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
      const change = await changeStep(stepDeps, ctx, taskId, async (tx, run, step, process) => {
        const runs = processRepository(tx);
        const newer = await runs.findRunInProgress(run.processId, run.recordType, run.recordId);
        const subject = run.subjectEmployeeId
          ? await starter.readSubject(tx, run.subjectEmployeeId)
          : null;
        const reopened = reopenStep(run, step, {
          processName: process.name,
          subjectFirstName: subject?.firstName ?? null,
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
      const runId = (await reader.requireRun(orm, runIdOf(task))).id;
      return transact(async (tx) => {
        const runs = processRepository(tx);
        // Locked, so a step change committing meanwhile cannot pair its steps with the old status.
        const run = (await runs.lockRun(runId))!;
        const [process] = await runs.findProcessesByIds([run.processId]);
        const steps = (await runs.findSteps(run.id)).filter(
          ({ status }) => status !== "step_skipped",
        );
        return {
          processName: process!.name,
          subjectEmployeeId: run.subjectEmployeeId,
          status: run.status,
          doneSteps: steps.filter(({ status }) => status === "step_completed").length,
          totalSteps: steps.length,
        };
      });
    },

    async cancelRun(ctx, runId, reason) {
      const trimmed = reason.trim();
      if (!trimmed) throw invalidInput([{ field: "reason", code: "required" }]);
      const found = await reader.requireRun(orm, runId);
      await ctx.requireInScope("process_run", "update", found.subjectEmployeeId ?? "public");
      const run = await transact(async (tx) =>
        cancelAndSave(tasks, ctx, tx, (await processRepository(tx).lockRun(found.id))!, {
          cause: "cancelled_by_admin",
          reason: trimmed,
          taskReason: trimmed,
          byEmployeeId: ctx.user?.employeeId ?? null,
        }),
      );
      logger.info({ runId: run.id, cancelCause: run.cancelCause }, "Process run cancelled");
      return reader.readDetails(run);
    },

    async cancelIfCannotRun(tx, run) {
      if (run.status !== "in_progress") return run;
      const steps = await processRepository(tx).findSteps(run.id);
      const subject = run.subjectEmployeeId
        ? await starter.readSubject(tx, run.subjectEmployeeId)
        : null;
      const removal = removalCancellation(
        run,
        steps,
        run.subjectEmployeeId === null || subject !== null,
      );
      if (!removal) return run;
      const reason =
        removal.cause === "cancelled_because_subject_was_removed"
          ? SUBJECT_REMOVED
          : `The assignee of '${(await starter.stepTitles(tx, run)).get(removal.stepKey!)}' was removed from Broccoli.`;
      return cancelAndSave(tasks, PrincipalSecurityContext.system(), tx, run, {
        cause: removal.cause,
        reason,
        taskReason: PROCESS_CANCELLED,
        byEmployeeId: null,
      });
    },
  };

  const stepDeps = { orm, transact, tasks, reader, lifecycle };
  return lifecycle;
}

/**
 * Locks the task's process, then its run (the order starts take), cancels the run when it can no
 * longer run, else applies the step change and settles the run; one transaction commits either.
 */
async function changeStep(
  { orm, transact, tasks, reader, lifecycle }: StepCommandDeps,
  ctx: SecurityContext,
  taskId: string,
  change: StepCommand,
): Promise<StepChange> {
  const task = await tasks.readTask(ctx, taskId);
  const runId = runIdOf(task);
  const [process] = await processRepository(orm).findProcessesByIds([
    (await reader.requireRun(orm, runId)).processId,
  ]);
  return transact(async (tx) => {
    const runs = processRepository(tx);
    await runs.lockProcess(process!.id);
    const locked = (await runs.lockRun(runId))!;
    const checked = await lifecycle.cancelIfCannotRun(tx, locked);
    if (checked.status === "cancelled" && locked.status !== "cancelled") {
      const [cancelledTask] = await tasks.readTasksInTransaction(tx, [task.id]);
      return { run: assigneeView(reader.view(checked, process!)), task: cancelledTask! };
    }
    const steps = await runs.findSteps(locked.id);
    const step = steps.find(({ taskId: id }) => id === task.id)!;
    const changed = await change(tx, locked, step, process!);
    await runs.saveSteps([changed.step]);
    const settled = settleRun(
      locked,
      steps.map((s) => (s.stepKey === step.stepKey ? changed.step : s)),
      new Date(),
    );
    const saved = settled === locked ? locked : await runs.saveRun(settled);
    return { run: assigneeView(reader.view(saved, process!)), task: changed.task };
  });
}

interface StepCommandDeps {
  orm: Orm;
  transact: Transact;
  tasks: TaskService;
  reader: RunReader;
  lifecycle: RunLifecycleService;
}

/** Cancels the locked run: its open tasks with `taskReason`, the run with its cause and reason. */
async function cancelAndSave(
  tasks: TaskService,
  ctx: SecurityContext,
  tx: Tx,
  run: StoredRun,
  how: Cancellation,
): Promise<StoredRun> {
  const runs = processRepository(tx);
  const steps = await runs.findSteps(run.id);
  const cancelled = cancelRun(run, steps, { ...how, now: new Date() });
  await tasks.cancelInTransaction(ctx, tx, {
    taskIds: steps.flatMap(({ status, taskId }) =>
      status === "step_awaiting_task_completion" && taskId ? [taskId] : [],
    ),
    reason: how.taskReason,
    cause: { kind: "PROCESS_RUN", ref: run.id },
  });
  await runs.saveSteps(cancelled.steps);
  return runs.saveRun(cancelled.run);
}

/** How a run is cancelled: its own cause and reason, and the reason its open tasks get. */
interface Cancellation {
  cause: CancelCause;
  reason: string;
  taskReason: string;
  byEmployeeId: string | null;
}

/** What a step command does to its task and step, inside the run's transaction. */
type StepCommand = (
  tx: Tx,
  run: StoredRun,
  step: RunStep,
  process: StoredProcess,
) => Promise<{ task: Task; step: RunStep }>;

function runIdOf(task: Task): string {
  const runId = task.type === "process_step_to_do" ? task.processSource?.processRunId : null;
  if (!runId) throw new ApplicationError("CONFLICT", "This task does not belong to a process.");
  return runId;
}

/** The run as an assignee's step change returns it: without why it was cancelled. */
function assigneeView(run: ProcessRun): StepChange["run"] {
  const visible: Partial<ProcessRun> = { ...run };
  delete visible.cancelReason;
  delete visible.cancelCause;
  return visible as StepChange["run"];
}
