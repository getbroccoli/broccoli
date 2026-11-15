import { ApplicationError } from "../../applicationError";
import type { Orm, Transact, Tx } from "../../db";
import type { PublishedEvent } from "../../events";
import { PrincipalSecurityContext, type SecurityContext } from "../../security";
import { type CalendarDate, laterOf } from "../../../utils";
import type { TaskService } from "../../tasks";
import { processRepository, runStepRepository } from "../db";
import { PROCESS_CANCELLED, type ProcessRun, SUBJECT_REMOVED } from "../domain";
import type { StepProgress } from "./processViews";
import type { RunStarter } from "./runStarter";
import type { StepStarter } from "./stepStarter";

/**
 * A run while it runs: it follows its steps' tasks as their assignees mark them done, and cancels
 * itself once its subject or a waiting step's assignee is gone.
 */
export interface RunLifecycleService {
  /**
   * Trusted, before the commit of the transaction that marked tasks done: completes their steps,
   * starts the steps that waited for them, and finishes each run with nothing left to do. Takes
   * each run's lock after the task's, as the change that marked it done holds it already.
   */
  completeStepsOfDoneTasks(tx: Tx, events: readonly PublishedEvent[]): Promise<void>;
  /** The run behind a task its assignee or asker reads, as counts. */
  readStepProgress(ctx: SecurityContext, taskId: string): Promise<StepProgress>;
  /**
   * The locked run, cancelled and saved when its subject or a waiting step's assignee is gone;
   * else as it was. The run cancels itself, so Broccoli is the author. The caller holds the run's
   * open tasks before the run.
   */
  cancelIfCannotRun(tx: Tx, run: ProcessRun): Promise<ProcessRun>;
}

export function createRunLifecycleService({
  orm,
  transact,
  tasks,
  starter,
  steps,
  today,
}: {
  orm: Orm;
  transact: Transact;
  tasks: TaskService;
  starter: RunStarter;
  steps: StepStarter;
  /** Today in London: the day a step that starts later resolves its assignee on. */
  today: () => CalendarDate;
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
      const awaiting = (await runStepRepository(tx).findStepsByTaskIds([...doneTaskIds])).filter(
        ({ status }) => status === "step_awaiting_task_completion",
      );
      const now = new Date();
      for (const runId of [...new Set(awaiting.map((step) => step.runId))].sort()) {
        const run = (await runs.lockRun(runId))!;
        // A run that can no longer run stays in progress for the daily check, which cancels it.
        const canGoOn = (await removalOf(starter, tx, run)) === null;
        const completed = run.completeTasks(doneTaskIds, now, canGoOn);
        const changed = canGoOn
          ? await steps.startReadySteps(tx, completed, laterOf(today(), run.startDay))
          : completed;
        await runs.saveRun(changed);
        tx.publish("processes.steps_completed", {
          runId,
          taskIds: run.openTaskIds().filter((taskId) => doneTaskIds.has(taskId)),
          startedStepKeys: startedStepKeys(completed, changed),
          runStatus: changed.status,
        });
      }
    },

    async readStepProgress(ctx, taskId) {
      const task = await tasks.readTask(ctx, taskId);
      const [step] = await runStepRepository(orm).findStepsByTaskIds([task.id]);
      if (!step) throw new ApplicationError("CONFLICT", "This task does not belong to a process.");
      return transact(async (tx) => {
        const runs = processRepository(tx);
        // Locked, so a step change committing meanwhile cannot pair its steps with the old status.
        const run = (await runs.lockRun(step.runId))!;
        const [process] = await runs.findProcessesByIds([run.processId]);
        const steps = run.steps.filter(({ status }) => status !== "step_skipped");
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
      const removal = await removalOf(starter, tx, run);
      if (!removal) return run;
      const reason =
        removal.cause === "cancelled_because_subject_was_removed"
          ? SUBJECT_REMOVED
          : `The assignee of '${(await steps.stepTitles(tx, run)).get(removal.stepKey!)}' was removed from Broccoli.`;
      const cancelled = run.cancel({
        cause: removal.cause,
        reason,
        byEmployeeId: null,
        now: new Date(),
      });
      await tasks.cancelInTransaction(PrincipalSecurityContext.system(), tx, {
        taskIds: run.openTaskIds(),
        reason: PROCESS_CANCELLED,
        cause: { kind: "PROCESS_RUN", ref: run.id },
      });
      await processRepository(tx).saveRun(cancelled);
      return cancelled;
    },
  };
}

/**
 * Why the run can no longer run, or null: its record or the person it is about is gone, or a step
 * still waiting lost its task with its assignee.
 */
async function removalOf(starter: RunStarter, tx: Tx, run: ProcessRun) {
  const subjects = await starter.readRecordSubjects(tx, run.recordType, [run.recordId]);
  const subjectExists =
    subjects.has(run.recordId) &&
    (run.subjectEmployeeId === null || subjects.get(run.recordId) !== null);
  return run.removal(subjectExists);
}

/** The steps that were waiting before and are no longer. */
function startedStepKeys(before: ProcessRun, after: ProcessRun): string[] {
  const waiting = new Set(
    before.steps.flatMap(({ stepKey, status }) =>
      status === "step_waiting_to_start" ? [stepKey] : [],
    ),
  );
  return after.steps.flatMap(({ stepKey, status }) =>
    waiting.has(stepKey) && status !== "step_waiting_to_start" ? [stepKey] : [],
  );
}
