import { ApplicationError } from "../../applicationError";
import type { CalendarDate } from "../../../utils";
import type { TaskResult } from "../../tasks";
import type { TriggerEvent } from "./eventTrigger";
import type {
  ActionStep,
  AfterEntry,
  AssigneeRule,
  ProcessStep,
  StepBase,
  StepJoin,
  TaskStep,
} from "./processDefinition";
import { taskStepsOf } from "./processDefinition";

export const RUN_STATUSES = ["in_progress", "finished", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const START_CAUSES = [
  "started_on_record_date",
  "started_by_admin",
  "started_on_event",
] as const;
export type StartCause = (typeof START_CAUSES)[number];

export const CANCEL_CAUSES = [
  "cancelled_because_step_assignee_was_removed",
  "cancelled_because_subject_was_removed",
] as const;
export type CancelCause = (typeof CANCEL_CAUSES)[number];

export const STEP_STATUSES = [
  "step_waiting_to_start",
  "step_awaiting_task_completion",
  "step_completed",
  "step_skipped",
  "step_not_reached",
  "step_cancelled",
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const ASSIGNEE_NOTES = ["assignee_is_owner_because_subject_has_no_manager"] as const;
export type AssigneeNote = (typeof ASSIGNEE_NOTES)[number];

export const SKIP_REASONS = ["no_assignee_for_step"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

/** Why a run whose subject was removed stops, on the run for admins. */
export const SUBJECT_REMOVED = "The person this process is about was removed from Broccoli.";

/** What the tasks of a run cancelled for a removal tell their assignees; the detail stays on the run. */
export const PROCESS_CANCELLED = "This process was cancelled.";

/** One run of a process version for one record, as stored. */
export interface ProcessRunFields {
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
  /** The event that started the run, for `started_on_event`; steps read who acted from it. */
  triggerEvent: TriggerEvent | null;
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

/** Where one step of a run stands; its task, created when the step starts, is the work. */
export interface RunStep {
  runId: string;
  stepKey: string;
  status: StepStatus;
  /** Null for a step waiting, skipped or not reached, and once the task's assignee was removed. */
  taskId: string | null;
  assigneeNote: AssigneeNote | null;
  skipReason: SkipReason | null;
  finishedAt: Date | null;
  /** What the task's assignee gave, kept on the step as the task goes with its assignee. */
  result: TaskResult | null;
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

/**
 * What the waiting steps can do now, each list in the definition's order: start, as their join
 * allows; or never start, because the steps they wait for went another way.
 */
export function decideWaitingSteps(
  steps: readonly StepBase[],
  progress: readonly Pick<RunStep, "stepKey" | "status" | "result">[],
): { ready: string[]; notReached: string[] } {
  const rowOf = new Map(progress.map((row) => [row.stepKey, row]));
  const ready: string[] = [];
  const notReached: string[] = [];
  for (const { key, after, join } of steps) {
    if (rowOf.get(key)?.status !== "step_waiting_to_start") continue;
    const states = after.map((entry) => entryState(entry, rowOf.get(entry.step)));
    if (canStart(join, states)) ready.push(key);
    else if (cannotEverStart(join, states)) notReached.push(key);
  }
  return { ready, notReached };
}

/** Whether a run with these steps has nothing left to do: every step completed, skipped or not reached. */
export function isEveryStepDone(steps: readonly Pick<RunStep, "status">[]): boolean {
  return steps.every(({ status }) => FINISHED_STATUSES.has(status));
}

/** A step that starts now, and who gets its task; null skips it for want of anyone. */
export interface StepStart {
  step: TaskStep;
  assignee: ResolvedAssignee | null;
}

/**
 * Starts the ready steps among `progress` and marks the not reached, again while that decides more;
 * an action step completes at once, as the caller runs its action in this transaction. Returns, in
 * order, the task steps started (task ids still null), the action steps completed, and the progress.
 */
export function startReadySteps(
  steps: readonly ProcessStep[],
  progress: readonly RunStep[],
  assigneeOf: (step: TaskStep) => ResolvedAssignee | null,
  now: Date,
): { starts: StepStart[]; completedActions: ActionStep[]; progress: RunStep[] } {
  const starts: StepStart[] = [];
  const completedActions: ActionStep[] = [];
  let current = [...progress];
  for (
    let decided = decideWaitingSteps(steps, current);
    decided.ready.length + decided.notReached.length > 0;
    decided = decideWaitingSteps(steps, current)
  ) {
    const { ready, notReached } = decided;
    const readySteps = steps.filter(({ key }) => ready.includes(key));
    const started = taskStepsOf(readySteps).map((step) => ({ step, assignee: assigneeOf(step) }));
    starts.push(...started);
    completedActions.push(...readySteps.flatMap((step) => (step.kind === "action" ? [step] : [])));
    current = current.map((row) => {
      const start = started.find(({ step }) => step.key === row.stepKey);
      if (start) return startedRow(row, start.assignee, now);
      if (ready.includes(row.stepKey)) return { ...row, status: "step_completed", finishedAt: now };
      return notReached.includes(row.stepKey)
        ? { ...row, status: "step_not_reached", finishedAt: now }
        : row;
    });
  }
  return { starts, completedActions, progress: current };
}

/**
 * A run with its steps, and the rules of its life: its steps start once the steps they wait for are
 * done, complete as their tasks are done, the run finishes when none awaits a task or waits, and it
 * is cancelled when it can no longer run. Every change returns a new run; the original stays.
 */
export class ProcessRun implements Readonly<ProcessRunFields> {
  declare readonly id: string;
  declare readonly processId: string;
  declare readonly processVersionId: string;
  declare readonly recordType: string;
  declare readonly recordId: string;
  declare readonly subjectEmployeeId: string | null;
  declare readonly startCause: StartCause;
  declare readonly startedByEmployeeId: string | null;
  declare readonly triggerDate: CalendarDate | null;
  declare readonly startKey: string | null;
  declare readonly triggerEvent: TriggerEvent | null;
  declare readonly startDay: CalendarDate;
  declare readonly status: RunStatus;
  declare readonly finishedAt: Date | null;
  declare readonly cancelledAt: Date | null;
  declare readonly cancelledByEmployeeId: string | null;
  declare readonly cancelCause: CancelCause | null;
  declare readonly cancelReason: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  readonly steps: readonly RunStep[];

  private constructor(fields: ProcessRunFields, steps: readonly RunStep[]) {
    Object.assign(this, fields);
    this.steps = steps;
  }

  /** The run and its steps, as stored. */
  static restore(fields: ProcessRunFields, steps: readonly RunStep[]): ProcessRun {
    return new ProcessRun(fields, steps);
  }

  /** The tasks of steps still awaiting them. */
  openTaskIds(): string[] {
    return openTaskIdsOf(this.steps);
  }

  /**
   * Completes the steps awaiting these done tasks with their results, and finishes the run once no
   * step awaits a task; a run that cannot go on stays in progress, for the daily check to cancel.
   */
  completeTasks(
    resultsByTaskId: ReadonlyMap<string, TaskResult | null>,
    now: Date,
    canGoOn: boolean,
  ): ProcessRun {
    if (this.status === "cancelled") {
      throw new ApplicationError("CONFLICT", PROCESS_CANCELLED);
    }
    const steps = this.steps.map((step) =>
      step.status === "step_awaiting_task_completion" &&
      step.taskId &&
      resultsByTaskId.has(step.taskId)
        ? {
            ...step,
            status: "step_completed" as const,
            finishedAt: now,
            result: resultsByTaskId.get(step.taskId) ?? null,
          }
        : step,
    );
    if (!canGoOn || this.status === "finished") return this.with({}, steps);
    return this.settled(steps, now);
  }

  /**
   * The run with these waiting steps started or not reached, as stored; it finishes when none
   * awaits a task or waits.
   */
  withDecidedSteps(decided: readonly RunStep[], now: Date): ProcessRun {
    const byKey = new Map(decided.map((step) => [step.stepKey, step]));
    return this.settled(
      this.steps.map((step) => byKey.get(step.stepKey) ?? step),
      now,
    );
  }

  /**
   * Why a run in progress can no longer run, if it cannot: its subject is gone, or a step still
   * awaiting its task lost it with its assignee. A step done before its assignee left changes nothing.
   */
  removal(subjectExists: boolean): { cause: CancelCause; stepKey: string | null } | null {
    if (this.status !== "in_progress") return null;
    if (!subjectExists) return { cause: "cancelled_because_subject_was_removed", stepKey: null };
    const orphan = this.steps.find(
      ({ status, taskId }) => status === "step_awaiting_task_completion" && taskId === null,
    );
    return orphan
      ? { cause: "cancelled_because_step_assignee_was_removed", stepKey: orphan.stepKey }
      : null;
  }

  /** Cancels a run in progress: its awaiting steps are cancelled, done steps stay. */
  cancel(cancellation: {
    cause: CancelCause;
    reason: string;
    byEmployeeId: string | null;
    now: Date;
  }): ProcessRun {
    if (this.status !== "in_progress") {
      throw new ApplicationError("CONFLICT", "Only a run in progress can be cancelled.");
    }
    return this.with(
      {
        status: "cancelled",
        cancelledAt: cancellation.now,
        cancelledByEmployeeId: cancellation.byEmployeeId,
        cancelCause: cancellation.cause,
        cancelReason: cancellation.reason,
      },
      this.steps.map((step) =>
        step.status === "step_awaiting_task_completion" || step.status === "step_waiting_to_start"
          ? { ...step, status: "step_cancelled", finishedAt: cancellation.now }
          : step,
      ),
    );
  }

  private settled(steps: readonly RunStep[], now: Date): ProcessRun {
    return isEveryStepDone(steps)
      ? this.with({ status: "finished", finishedAt: now }, steps)
      : this.with({}, steps);
  }

  private with(changes: Partial<ProcessRunFields>, steps: readonly RunStep[]): ProcessRun {
    return new ProcessRun({ ...this, ...changes }, steps);
  }
}

/** The tasks of these steps still awaiting them. */
export function openTaskIdsOf(steps: readonly RunStep[]): string[] {
  return steps.flatMap(({ status, taskId }) =>
    status === "step_awaiting_task_completion" && taskId ? [taskId] : [],
  );
}

function startedRow(row: RunStep, assignee: ResolvedAssignee | null, now: Date): RunStep {
  return assignee
    ? { ...row, status: "step_awaiting_task_completion", assigneeNote: assignee.note }
    : {
        ...row,
        status: "step_skipped",
        skipReason: "no_assignee_for_step",
        finishedAt: now,
      };
}

const FINISHED_STATUSES: ReadonlySet<StepStatus> = new Set([
  "step_completed",
  "step_skipped",
  "step_not_reached",
]);

type EntryState = "met" | "pending" | "impossible";

/** Whether the step an entry names lets it start, may still, or never will. */
function entryState(
  { when }: AfterEntry,
  row: Pick<RunStep, "status" | "result"> | undefined,
): EntryState {
  switch (row?.status) {
    case "step_completed":
      return !when || row.result?.code === when.result ? "met" : "impossible";
    case "step_skipped":
      // A skipped step counts as done, but nobody gave it a result.
      return when ? "impossible" : "met";
    case "step_not_reached":
    case "step_cancelled":
      return "impossible";
    default:
      return "pending";
  }
}

/** `all`: every entry is met; `any`: one is; a step waiting for nothing can always start. */
function canStart(join: StepJoin, states: readonly EntryState[]): boolean {
  if (states.length === 0) return true;
  return join === "all" ? states.every(isMet) : states.some(isMet);
}

/** `all`: one entry is impossible; `any`: every one is. */
function cannotEverStart(join: StepJoin, states: readonly EntryState[]): boolean {
  return join === "all" ? states.some(isImpossible) : states.every(isImpossible);
}

function isMet(state: EntryState): boolean {
  return state === "met";
}

function isImpossible(state: EntryState): boolean {
  return state === "impossible";
}
