import { ApplicationError } from "../../applicationError";
import type { Transact, Tx } from "../../db";
import type { PublishedEvent } from "../../events";
import { PrincipalSecurityContext, type SecurityContext } from "../../security";
import { type CalendarDate, laterOf } from "../../../utils";
import { resultLabel, type Task, type TaskService } from "../../tasks";
import { processRepository, runStepRepository } from "../db";
import {
  type CancelCause,
  openTaskIdsOf,
  type OutcomeRule,
  outcomeOf,
  PROCESS_CANCELLED,
  type ProcessRun,
  type StepStatus,
  SUBJECT_REMOVED,
} from "../domain";
import type { StepProgress } from "./processViews";
import type { RunEndings } from "./runEndings";
import type { RunStarter } from "./runStarter";
import type { StepStarter } from "./stepStarter";

/**
 * A run while it runs: it follows its steps' tasks as their assignees mark them done, and cancels
 * itself once its subject or a waiting step's assignee is gone, or its record is withdrawn.
 */
export interface RunLifecycleService {
  /**
   * Trusted, before the commit of the transaction that marked tasks done: completes their steps,
   * starts the steps that waited for them, and finishes each run with nothing left to do. Takes
   * each run's lock after the task's, as the change that marked it done holds it already.
   */
  completeStepsOfDoneTasks(tx: Tx, events: readonly PublishedEvent[]): Promise<void>;
  /** The run behind a task its assignee or asker reads, as counts. */
  readStepProgress(
    ctx: SecurityContext,
    taskIds: readonly string[],
  ): Promise<Map<string, StepProgress>>;
  /**
   * The locked run, cancelled and saved when its subject or a waiting step's assignee is gone;
   * else as it was. The run cancels itself, so Broccoli is the author. The caller holds the run's
   * open tasks before the run.
   */
  cancelIfCannotRun(tx: Tx, run: ProcessRun): Promise<ProcessRun>;
  /**
   * Trusted, for the feature that owns a record it no longer wants decided: cancels the record's
   * run in progress of one of these processes, and its open tasks with the reason. Takes the open
   * tasks before the run, as a task's change does; null when none is in progress any more.
   */
  cancelRunOfRecord(tx: Tx, withdrawal: RecordWithdrawal): Promise<ProcessRun | null>;
}

/** A record withdrawn from its processes: which runs, why, and by whom. */
export interface RecordWithdrawal {
  processKeys: readonly string[];
  recordType: string;
  recordId: string;
  /** What the assignees of its open tasks read. */
  reason: string;
  /** Null when Broccoli withdrew it. */
  byEmployeeId: string | null;
}

export function createRunLifecycleService({
  transact,
  tasks,
  starter,
  steps,
  runEndings,
  today,
}: {
  transact: Transact;
  tasks: TaskService;
  starter: RunStarter;
  steps: StepStarter;
  runEndings: RunEndings;
  /** Today in London: the day a step that starts later resolves its assignee on. */
  today: () => CalendarDate;
}): RunLifecycleService {
  return {
    async completeStepsOfDoneTasks(tx, events) {
      const resultsByTaskId = new Map(
        events.flatMap(({ type, payload }) =>
          type === "tasks.task_status_changed" && payload.to === "done"
            ? [[payload.taskId, payload.result] as const]
            : [],
        ),
      );
      if (resultsByTaskId.size === 0) return;
      const runs = processRepository(tx);
      const awaiting = (
        await runStepRepository(tx).findStepsByTaskIds([...resultsByTaskId.keys()])
      ).filter(({ status }) => status === "step_awaiting_task_completion");
      const now = new Date();
      const ended: ProcessRun[] = [];
      for (const runId of [...new Set(awaiting.map((step) => step.runId))].sort()) {
        const run = (await runs.lockRun(runId))!;
        // A run that can no longer run stays in progress for the daily check, which cancels it.
        const canGoOn = (await removalOf(starter, tx, run)) === null;
        const completed = run.completeTasks(resultsByTaskId, now, canGoOn);
        const changed = canGoOn
          ? await steps.startReadySteps(tx, completed, laterOf(today(), run.startDay))
          : completed;
        await runs.saveRun(changed);
        if (run.status === "in_progress") ended.push(changed);
        tx.publish("processes.steps_completed", {
          runId,
          taskIds: run.openTaskIds().filter((taskId) => resultsByTaskId.has(taskId)),
          startedStepKeys: decidedStepKeys(completed, changed, isStarted),
          notReachedStepKeys: decidedStepKeys(completed, changed, isNotReached),
          runStatus: changed.status,
        });
      }
      await runEndings.publishEnded(tx, ended);
    },

    async readStepProgress(ctx, taskIds) {
      const employeeId = ctx.user?.employeeId;
      if (!employeeId || taskIds.length === 0) return new Map();
      return transact(async (tx) => {
        const taskSteps = await runStepRepository(tx).findStepsByTaskIds(taskIds);
        const runs = processRepository(tx);
        // The runs first: their share lock waits for a decision in flight, so the tasks read after
        // it agree with them.
        const runOf = byIds(await runs.readRunsWithSteps([...new Set(taskSteps.map(runIdOf))]));
        const taskOf = byIds(
          (await tasks.readTasksInTransaction(tx, taskSteps.map(taskIdOf))).filter((task) =>
            task.isVisibleTo(employeeId),
          ),
        );
        const runList = [...runOf.values()];
        const processOf = byIds(
          await runs.findProcessesByIds([...new Set(runList.map(processIdOf))]),
        );
        const ruleOf = await runEndings.readOutcomeRules(tx, runList.map(versionIdOf));
        const progress = new Map<string, StepProgress>();
        for (const step of taskSteps) {
          const task = taskOf.get(taskIdOf(step));
          if (!task) continue;
          const run = runOf.get(step.runId)!;
          const rule = ruleOf.get(run.processVersionId)!;
          const processName = processOf.get(run.processId)!.name;
          progress.set(
            task.id,
            progressOf(run, processName, rule, { task, stepKey: step.stepKey }),
          );
        }
        return progress;
      });
    },

    async cancelIfCannotRun(tx, run) {
      if (run.status !== "in_progress") return run;
      const removal = await removalOf(starter, tx, run);
      if (!removal) return run;
      const reason =
        removal.cause === "cancelled_because_subject_was_removed"
          ? SUBJECT_REMOVED
          : // The task goes with its assignee, or with the person who asked for it.
            `The task '${(await steps.stepTitles(tx, run)).get(removal.stepKey!)}' was removed with the person it was given to or who asked for it.`;
      return cancelRun({ tasks, runEndings }, tx, run, {
        cause: removal.cause,
        reason,
        taskReason: PROCESS_CANCELLED,
        byEmployeeId: null,
      });
    },

    async cancelRunOfRecord(tx, { processKeys, recordType, recordId, reason, byEmployeeId }) {
      const found = await findRunInProgress(tx, processKeys, recordType, recordId);
      if (!found) return null;
      const { run, tasksChanged } = await lockRunWithOpenTasks(tasks, tx, found.id);
      // A decision that committed meanwhile ended the run, or a reset removed it: nothing is left.
      if (run?.status !== "in_progress") return null;
      if (tasksChanged) throw new ApplicationError("CONFLICT", RUN_CHANGED);
      return cancelRun({ tasks, runEndings }, tx, run, {
        cause: "cancelled_because_record_was_withdrawn",
        reason,
        taskReason: reason,
        byEmployeeId,
      });
    },
  };
}

/**
 * Locks the run's open tasks, then the run, as a task's change does, and says whether its open
 * tasks changed between the read and the locks; null run when it is gone.
 */
export async function lockRunWithOpenTasks(
  tasks: Pick<TaskService, "lockInTransaction">,
  tx: Tx,
  runId: string,
): Promise<{ run: ProcessRun | null; tasksChanged: boolean }> {
  const locked = openTaskIdsOf(await runStepRepository(tx).findSteps(runId));
  await tasks.lockInTransaction(tx, locked);
  const run = await processRepository(tx).lockRun(runId);
  // Neither read orders the steps, so the ids are compared as sets.
  const open = run?.openTaskIds() ?? [];
  const tasksChanged = open.length !== locked.length || open.some((id) => !locked.includes(id));
  return { run, tasksChanged };
}

/** Why a withdrawal stops when a step finished between reading the run and locking it. */
const RUN_CHANGED = "This was decided meanwhile. Look again.";

/** Cancels the locked run in progress and its open tasks, saves it and tells who follows it. */
async function cancelRun(
  { tasks, runEndings }: { tasks: TaskService; runEndings: RunEndings },
  tx: Tx,
  run: ProcessRun,
  cancellation: {
    cause: CancelCause;
    reason: string;
    taskReason: string;
    byEmployeeId: string | null;
  },
): Promise<ProcessRun> {
  const { taskReason, ...rest } = cancellation;
  const cancelled = run.cancel({ ...rest, now: new Date() });
  await tasks.cancelInTransaction(PrincipalSecurityContext.system(), tx, {
    taskIds: run.openTaskIds(),
    reason: taskReason,
    cause: { kind: "PROCESS_RUN", ref: run.id },
  });
  await processRepository(tx).saveRun(cancelled);
  await runEndings.publishEnded(tx, [cancelled]);
  return cancelled;
}

/** The record's run in progress of one of these processes, unlocked; null without one. */
async function findRunInProgress(
  tx: Tx,
  processKeys: readonly string[],
  recordType: string,
  recordId: string,
) {
  const runs = processRepository(tx);
  for (const key of processKeys) {
    const process = await runs.findProcessByKey(key);
    const run = process && (await runs.findRunInProgress(process.id, recordType, recordId));
    if (run) return run;
  }
  return null;
}

/** How far the run is, and its outcome when the task is its outcome step's. */
function progressOf(
  run: ProcessRun,
  processName: string,
  rule: OutcomeRule | null,
  { task, stepKey }: { task: Task; stepKey: string },
): StepProgress {
  const counted = run.steps.filter(
    ({ status }) => status !== "step_skipped" && status !== "step_not_reached",
  );
  const decides = stepKey === rule?.step;
  const given = decides ? outcomeOf(rule, run) : null;
  return {
    processName,
    subjectEmployeeId: run.subjectEmployeeId,
    status: run.status,
    endedAt: run.finishedAt ?? run.cancelledAt,
    doneSteps: counted.filter(({ status }) => status === "step_completed").length,
    totalSteps: counted.length,
    decidesOutcome: decides,
    outcome: given && {
      ...given.result,
      label: Object.hasOwn(rule!.labels, given.result.code)
        ? rule!.labels[given.result.code]!
        : resultLabel(task.resultForm!, given.result.code),
      byEmployeeId: task.doneByEmployeeId,
      at: given.finishedAt!,
    },
  };
}

function byIds<Item extends { id: string }>(items: readonly Item[]): Map<string, Item> {
  return new Map(items.map((item) => [item.id, item]));
}

function taskIdOf({ taskId }: { taskId: string | null }): string {
  return taskId!;
}

function runIdOf({ runId }: { runId: string }): string {
  return runId;
}

function processIdOf({ processId }: { processId: string }): string {
  return processId;
}

function versionIdOf({ processVersionId }: { processVersionId: string }): string {
  return processVersionId;
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

/** The steps that were waiting before and are now as `decision` says. */
function decidedStepKeys(
  before: ProcessRun,
  after: ProcessRun,
  decision: (status: StepStatus) => boolean,
): string[] {
  const waiting = new Set(
    before.steps.flatMap(({ stepKey, status }) =>
      status === "step_waiting_to_start" ? [stepKey] : [],
    ),
  );
  return after.steps.flatMap(({ stepKey, status }) =>
    waiting.has(stepKey) && decision(status) ? [stepKey] : [],
  );
}

function isStarted(status: StepStatus): boolean {
  return status !== "step_waiting_to_start" && status !== "step_not_reached";
}

function isNotReached(status: StepStatus): boolean {
  return status === "step_not_reached";
}
