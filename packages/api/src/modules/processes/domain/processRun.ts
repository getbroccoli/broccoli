import { ApplicationError } from "../../../core/applicationError";
import type { CalendarDate } from "../../../utils";
import type { AssigneeRule } from "./processDefinition";

export const RUN_STATUSES = ["in_progress", "finished", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const START_CAUSES = ["started_on_record_date", "started_by_admin"] as const;
export type StartCause = (typeof START_CAUSES)[number];

export const CANCEL_CAUSES = [
  "cancelled_by_admin",
  "cancelled_because_step_assignee_was_removed",
  "cancelled_because_subject_was_removed",
] as const;
export type CancelCause = (typeof CANCEL_CAUSES)[number];

export const STEP_STATUSES = [
  "step_awaiting_task_completion",
  "step_completed",
  "step_skipped",
  "step_cancelled",
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const ASSIGNEE_NOTES = ["assignee_is_owner_because_subject_has_no_manager"] as const;
export type AssigneeNote = (typeof ASSIGNEE_NOTES)[number];

export const SKIP_REASONS = ["no_assignee_for_step"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

/** Why a run whose subject was removed stops: on the run for admins, and refusing a reopen. */
export const SUBJECT_REMOVED = "The person this process is about was removed from Broccoli.";

/** What the tasks of a run cancelled for a removal tell their assignees; the detail stays on the run. */
export const PROCESS_CANCELLED = "This process was cancelled.";

/** One run of a process version for one record. */
export interface ProcessRun {
  id: string;
  processId: string;
  processVersionId: string;
  recordType: string;
  recordId: string;
  /** The employee the run is about, which permission scopes filter on; null for a record about nobody. */
  subjectEmployeeId: string | null;
  startCause: StartCause;
  startedByEmployeeId: string | null;
  /** The date the trigger fired for; with the process, `startKey` keeps it from starting twice. */
  triggerDate: CalendarDate | null;
  startKey: string | null;
  /** The day due dates count from. */
  startDay: CalendarDate;
  status: RunStatus;
  finishedAt: Date | null;
  cancelledAt: Date | null;
  cancelledByEmployeeId: string | null;
  cancelCause: CancelCause | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Where one step of a run stands; its task, once created, is the work. */
export interface RunStep {
  runId: string;
  stepKey: string;
  status: StepStatus;
  /** Null for a skipped step, and once the task's assignee was removed. */
  taskId: string | null;
  assigneeNote: AssigneeNote | null;
  skipReason: SkipReason | null;
  finishedAt: Date | null;
}

/** The person a step's task goes to, and why, when it is not the obvious one. */
export interface ResolvedAssignee {
  employeeId: string;
  note: AssigneeNote | null;
}

/**
 * Follows a step's assignee rule and its fallbacks to the first kind with a person; null when none
 * has one, so the step is skipped.
 */
export function resolveAssignee(
  rule: AssigneeRule,
  candidates: Readonly<Record<AssigneeRule["kind"], string | null>>,
): ResolvedAssignee | null {
  const employeeId = candidates[rule.kind];
  if (employeeId !== null) {
    return { employeeId, note: null };
  }
  const fallback = rule.otherwise ? resolveAssignee(rule.otherwise, candidates) : null;
  if (fallback && rule.kind === "subjects_manager" && rule.otherwise?.kind === "workspace_owner") {
    return { ...fallback, note: "assignee_is_owner_because_subject_has_no_manager" };
  }
  return fallback;
}

/** A run whose steps are all completed or skipped is finished; one with an open step is in progress. */
export function settleRun(run: ProcessRun, steps: readonly RunStep[], now: Date): ProcessRun {
  const allDone = steps.every(
    ({ status }) => status === "step_completed" || status === "step_skipped",
  );
  if (allDone) {
    return run.status === "finished" ? run : { ...run, status: "finished", finishedAt: now };
  }
  return { ...run, status: "in_progress", finishedAt: null };
}

export function completeStep(run: ProcessRun, step: RunStep, now: Date): RunStep {
  refuseUnlessOpen(run);
  return { ...step, status: "step_completed", finishedAt: now };
}

/** Takes a completed step back to awaiting its task, in a run not cancelled or superseded. */
export function reopenStep(
  run: ProcessRun,
  step: RunStep,
  {
    processName,
    subjectFirstName,
    isSuperseded,
  }: {
    processName: string;
    /** Null once the person the run is about was removed. */
    subjectFirstName: string | null;
    isSuperseded: boolean;
  },
): RunStep {
  if (run.status === "cancelled") {
    throw new ApplicationError("CONFLICT", PROCESS_CANCELLED);
  }
  if (run.subjectEmployeeId !== null && subjectFirstName === null) {
    throw new ApplicationError("CONFLICT", SUBJECT_REMOVED);
  }
  if (isSuperseded) {
    throw new ApplicationError(
      "CONFLICT",
      `${processName} was started again for ${subjectFirstName}; this run is closed.`,
    );
  }
  return { ...step, status: "step_awaiting_task_completion", finishedAt: null };
}

/** A run cancelled: open steps cancelled, done steps kept. */
export function cancelRun(
  run: ProcessRun,
  steps: readonly RunStep[],
  cancellation: { cause: CancelCause; reason: string; byEmployeeId: string | null; now: Date },
): { run: ProcessRun; steps: RunStep[] } {
  if (run.status !== "in_progress") {
    throw new ApplicationError("CONFLICT", "Only a run in progress can be cancelled.");
  }
  return {
    run: {
      ...run,
      status: "cancelled",
      cancelledAt: cancellation.now,
      cancelledByEmployeeId: cancellation.byEmployeeId,
      cancelCause: cancellation.cause,
      cancelReason: cancellation.reason,
    },
    steps: steps.map((step) =>
      step.status === "step_awaiting_task_completion"
        ? { ...step, status: "step_cancelled", finishedAt: cancellation.now }
        : step,
    ),
  };
}

/**
 * Why a run in progress can no longer run, if it cannot: its subject is gone, or a step still
 * awaiting its task lost it with its assignee. A step done before its assignee left changes nothing.
 */
export function removalCancellation(
  run: ProcessRun,
  steps: readonly RunStep[],
  subjectExists: boolean,
): { cause: CancelCause; stepKey: string | null } | null {
  if (run.status !== "in_progress") return null;
  if (!subjectExists) return { cause: "cancelled_because_subject_was_removed", stepKey: null };
  const orphan = steps.find(
    ({ status, taskId }) => status === "step_awaiting_task_completion" && taskId === null,
  );
  return orphan
    ? { cause: "cancelled_because_step_assignee_was_removed", stepKey: orphan.stepKey }
    : null;
}

function refuseUnlessOpen(run: ProcessRun): void {
  if (run.status === "cancelled") {
    throw new ApplicationError("CONFLICT", PROCESS_CANCELLED);
  }
}
