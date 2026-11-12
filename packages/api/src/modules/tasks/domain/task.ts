import { ApplicationError } from "../../../core/applicationError";
import type { CalendarDate } from "../../../utils";

/** A task finished by hand with Mark done; features add their own types. */
export const TASK_TYPES = ["manual_to_do"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = ["to_do", "waiting", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** The process step that created a task, when no person asked for it. */
export interface TaskProcessSource {
  processKey: string;
  processRunId: string | null;
  stepKey: string;
}

/** The record a task acts on, as the records registry names it. */
export interface TaskRecord {
  recordType: string;
  recordId: string;
}

/** Work asked of one person, and where it stands. */
export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  title: string;
  description: string | null;
  assigneeEmployeeId: string;
  askedByEmployeeId: string | null;
  subjectEmployeeId: string | null;
  processSource: TaskProcessSource | null;
  record: TaskRecord | null;
  dueDate: CalendarDate | null;
  doneAt: Date | null;
  doneByEmployeeId: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Only the assignee and the person who asked see a task; whom it is about does not count. */
export function isTaskVisibleTo(task: Task, employeeId: string): boolean {
  return task.assigneeEmployeeId === employeeId || task.askedByEmployeeId === employeeId;
}

export function markTaskDone(task: Task, byEmployeeId: string, now: Date): Task {
  refuseClosed(task);
  if (task.status === "waiting") {
    throw new ApplicationError("CONFLICT", "This task is waiting.");
  }
  return { ...task, status: "done", doneAt: now, doneByEmployeeId: byEmployeeId };
}

export function reopenTask(task: Task): Task {
  if (task.status !== "done") {
    throw new ApplicationError("CONFLICT", "Only a done task can be reopened.");
  }
  return { ...task, status: "to_do", doneAt: null, doneByEmployeeId: null };
}

/** `reason` is the trimmed, non-blank reason the caller checked. */
export function cancelTask(task: Task, reason: string, now: Date): Task {
  refuseClosed(task);
  return { ...task, status: "cancelled", cancelledAt: now, cancelReason: reason };
}

export function markTaskWaiting(task: Task): Task {
  if (task.status === "cancelled") {
    throw cancelledConflict();
  }
  if (task.status !== "to_do") {
    throw new ApplicationError("CONFLICT", "Only a task to do can wait.");
  }
  return { ...task, status: "waiting" };
}

function refuseClosed(task: Task): void {
  if (task.status === "done") {
    throw new ApplicationError("CONFLICT", "This task is already done.");
  }
  if (task.status === "cancelled") {
    throw cancelledConflict();
  }
}

function cancelledConflict(): ApplicationError {
  return new ApplicationError("CONFLICT", "This task was cancelled.");
}
