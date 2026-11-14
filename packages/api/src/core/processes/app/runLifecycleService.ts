import { ApplicationError } from "../../applicationError";
import type { Orm, Transact, Tx } from "../../db";
import type { PublishedEvent } from "../../events";
import { PrincipalSecurityContext, type SecurityContext } from "../../security";
import type { TaskService } from "../../tasks";
import { processRepository } from "../db";
import {
  type CancelCause,
  cancelRun,
  completeStep,
  PROCESS_CANCELLED,
  type ProcessRun as StoredRun,
  removalCancellation,
  type RunStep,
  settleRun,
  SUBJECT_REMOVED,
} from "../domain";
import type { StepProgress } from "./processViews";
import type { RunStarter } from "./runStarter";

/**
 * A run while it runs: it follows its steps' tasks as their assignees mark them done, and cancels
 * itself once its subject or a waiting step's assignee is gone.
 */
export interface RunLifecycleService {
  /**
   * Trusted, before the commit of the transaction that marked tasks done: completes their steps
   * and finishes each run with no step left awaiting its task. Takes each run's lock after the
   * task's, as the change that marked it done holds it already.
   */
  completeStepsOfDoneTasks(tx: Tx, events: readonly PublishedEvent[]): Promise<void>;
  /** The run behind a task its assignee or asker reads, as counts. */
  readStepProgress(ctx: SecurityContext, taskId: string): Promise<StepProgress>;
  /**
   * The locked run, cancelled and saved when its subject or a waiting step's assignee is gone;
   * else as it was. The run cancels itself, so Broccoli is the author. The caller holds the run's
   * open tasks before the run.
   */
  cancelIfCannotRun(tx: Tx, run: StoredRun): Promise<StoredRun>;
}

export function createRunLifecycleService({
  orm,
  transact,
  tasks,
  starter,
}: {
  orm: Orm;
  transact: Transact;
  tasks: TaskService;
  starter: RunStarter;
}): RunLifecycleService {
  return {
    async completeStepsOfDoneTasks(tx, events) {
      const doneTaskIds = new Set(
        events.flatMap(({ type, payload }) =>
          type === "tasks.task_status_changed" && payload.to === "done" ? [payload.taskId] : [],
        ),
      );
      if (doneTaskIds.size === 0) return;
      const runs = processRepository(tx);
      const awaiting = (await runs.findStepsByTaskIds([...doneTaskIds])).filter(
        ({ status }) => status === "step_awaiting_task_completion",
      );
      const now = new Date();
      for (const runId of [...new Set(awaiting.map((step) => step.runId))].sort()) {
        const run = (await runs.lockRun(runId))!;
        const steps = (await runs.findSteps(runId)).map((step) =>
          step.status === "step_awaiting_task_completion" && doneTaskIds.has(step.taskId!)
            ? completeStep(run, step, now)
            : step,
        );
        const completed = steps.filter(({ taskId }) => taskId && doneTaskIds.has(taskId));
        await runs.saveSteps(completed);
        // A run that can no longer run stays in progress for the daily check, which cancels it.
        const settled = (await removalOf(starter, tx, run, steps))
          ? run
          : settleRun(run, steps, now);
        if (settled !== run) await runs.saveRun(settled);
        tx.publish("processes.steps_completed", {
          runId,
          taskIds: completed.map(({ taskId }) => taskId!),
          runStatus: settled.status,
        });
      }
    },

    async readStepProgress(ctx, taskId) {
      const task = await tasks.readTask(ctx, taskId);
      const [step] = await processRepository(orm).findStepsByTaskIds([task.id]);
      if (!step) throw new ApplicationError("CONFLICT", "This task does not belong to a process.");
      return transact(async (tx) => {
        const runs = processRepository(tx);
        // Locked, so a step change committing meanwhile cannot pair its steps with the old status.
        const run = (await runs.lockRun(step.runId))!;
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

    async cancelIfCannotRun(tx, run) {
      if (run.status !== "in_progress") return run;
      const removal = await removalOf(
        starter,
        tx,
        run,
        await processRepository(tx).findSteps(run.id),
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
}

/**
 * Why the run can no longer run, or null: its record or the person it is about is gone, or a step
 * still waiting lost its task with its assignee.
 */
async function removalOf(starter: RunStarter, tx: Tx, run: StoredRun, steps: readonly RunStep[]) {
  const subjects = await starter.readRecordSubjects(tx, run.recordType, [run.recordId]);
  const subjectExists =
    subjects.has(run.recordId) &&
    (run.subjectEmployeeId === null || subjects.get(run.recordId) !== null);
  return removalCancellation(run, steps, subjectExists);
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
