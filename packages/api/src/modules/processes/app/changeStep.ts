import { type Tx } from "../../../core/db";
import { PrincipalSecurityContext, type SecurityContext } from "../../../core/security";
import type { Task } from "../../tasks";
import { processRepository, type StoredProcess } from "../db";
import {
  cancelRun as cancelledRun,
  PROCESS_CANCELLED,
  type ProcessRun as StoredRun,
  removalCancellation,
  type RunStep,
  settleRun,
  SUBJECT_REMOVED,
} from "../domain";
import {
  type Deps,
  type StepChange,
  requireRun,
  runIdOf,
  toAssigneeRun,
  toRunView,
} from "./processRunDetails";

/**
 * Locks the task's run, cancels it when it can no longer run, else applies the step change and
 * settles the run, all in one transaction that commits the cancellation too.
 */
export async function changeStep(
  deps: Deps,
  ctx: SecurityContext,
  taskId: string,
  change: (
    tx: Tx,
    run: StoredRun,
    step: RunStep,
    process: StoredProcess,
  ) => Promise<{ task: Task; step: RunStep }>,
): Promise<StepChange> {
  const { orm, transact, tasks } = deps;
  const task = await tasks.readTask(ctx, taskId);
  const runId = runIdOf(task);
  const [process] = await processRepository(orm).findProcessesByIds([
    (await requireRun(orm, runId)).processId,
  ]);
  return transact(async (tx) => {
    const runs = processRepository(tx);
    // The process before the run, as starts take it: a reopen and a start for one person take turns.
    await runs.lockProcess(process!.id);
    const locked = (await runs.lockRun(runId))!;
    const checked = await cancelIfCannotRun(deps, tx, locked);
    if (checked.status === "cancelled" && locked.status !== "cancelled") {
      const [cancelledTask] = await tasks.readTasksInTransaction(tx, [task.id]);
      return { run: toAssigneeRun(toRunView(checked, process!)), task: cancelledTask! };
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
    return { run: toAssigneeRun(toRunView(saved, process!)), task: changed.task };
  });
}

/**
 * The run, cancelled and saved when its subject or a waiting step's assignee is gone; else as it was.
 * The run cancels itself, so Broccoli is the author, whoever's command noticed.
 */
export async function cancelIfCannotRun(deps: Deps, tx: Tx, run: StoredRun): Promise<StoredRun> {
  if (run.status !== "in_progress") return run;
  const steps = await processRepository(tx).findSteps(run.id);
  const subject = run.subjectEmployeeId
    ? await deps.starter.readSubject(tx, run.subjectEmployeeId)
    : null;
  const removal = removalCancellation(
    run,
    steps,
    run.subjectEmployeeId === null || subject !== null,
  );
  if (!removal) return run;
  const runReason =
    removal.cause === "cancelled_because_subject_was_removed"
      ? SUBJECT_REMOVED
      : `The assignee of '${(await deps.starter.stepTitles(tx, run)).get(removal.stepKey!)}' was removed from Broccoli.`;
  return cancel(deps, PrincipalSecurityContext.system(), tx, run, {
    cause: removal.cause,
    runReason,
    taskReason: PROCESS_CANCELLED,
    byEmployeeId: null,
  });
}

/** Cancels a run in progress: its open tasks with `taskReason`, the run with its cause and `runReason`. */
export async function cancel(
  { tasks }: Deps,
  ctx: SecurityContext,
  tx: Tx,
  run: StoredRun,
  how: {
    cause: StoredRun["cancelCause"] & string;
    runReason: string;
    taskReason: string;
    byEmployeeId: string | null;
  },
): Promise<StoredRun> {
  const runs = processRepository(tx);
  const steps = await runs.findSteps(run.id);
  const cancelled = cancelledRun(run, steps, {
    cause: how.cause,
    reason: how.runReason,
    byEmployeeId: how.byEmployeeId,
    now: new Date(),
  });
  const openTaskIds = steps.flatMap(({ status, taskId }) =>
    status === "step_awaiting_task_completion" && taskId ? [taskId] : [],
  );
  await tasks.cancelInTransaction(ctx, tx, {
    taskIds: openTaskIds,
    reason: how.taskReason,
    cause: { kind: "PROCESS_RUN", ref: run.id },
  });
  await runs.saveSteps(cancelled.steps);
  return runs.saveRun(cancelled.run);
}
