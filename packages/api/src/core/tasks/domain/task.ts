import { ApplicationError } from "../../applicationError";
import type { CalendarDate } from "../../../utils";
import { acceptResult, type TaskResult, type TaskResultForm } from "./taskResult";

/** A task a person asked for; features that create tasks, such as processes, name their own types. */
export const MANUAL_TO_DO = "manual_to_do";

export const TASK_STATUSES = ["to_do", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** The record a task acts on, as the records registry names it. */
export interface TaskRecord {
  recordType: string;
  recordId: string;
}

/** A task's facts, as stored. */
export interface TaskFields {
  id: string;
  /** `manual_to_do`, or the type of the feature that created it. */
  type: string;
  status: TaskStatus;
  title: string;
  description: string | null;
  assigneeEmployeeId: string;
  askedByEmployeeId: string | null;
  subjectEmployeeId: string | null;
  record: TaskRecord | null;
  dueDate: CalendarDate | null;
  doneAt: Date | null;
  doneByEmployeeId: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  /** What it asks its assignee to give when they mark it done; null for a plain to-do. */
  resultForm: TaskResultForm | null;
  /** What its assignee gave, once done. */
  result: TaskResult | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Work asked of one person, and the rules of its life: who sees it, who finishes or deletes it,
 * and that done and cancelled are final. Every change returns a new task; the original stays.
 */
export class Task implements Readonly<TaskFields> {
  declare readonly id: string;
  declare readonly type: string;
  declare readonly status: TaskStatus;
  declare readonly title: string;
  declare readonly description: string | null;
  declare readonly assigneeEmployeeId: string;
  declare readonly askedByEmployeeId: string | null;
  declare readonly subjectEmployeeId: string | null;
  declare readonly record: TaskRecord | null;
  declare readonly dueDate: CalendarDate | null;
  declare readonly doneAt: Date | null;
  declare readonly doneByEmployeeId: string | null;
  declare readonly cancelledAt: Date | null;
  declare readonly cancelReason: string | null;
  declare readonly resultForm: TaskResultForm | null;
  declare readonly result: TaskResult | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  private constructor(fields: TaskFields) {
    Object.assign(this, fields);
  }

  /** The task as stored. */
  static restore(fields: TaskFields): Task {
    return new Task(fields);
  }

  /** Only the assignee and the person who asked see a task; whom it is about does not count. */
  isVisibleTo(employeeId: string): boolean {
    return this.assigneeEmployeeId === employeeId || this.askedByEmployeeId === employeeId;
  }

  /** Its assignee finishes it, whatever created it, with a result its form lists when it has one. */
  markDone(byEmployeeId: string, now: Date, result: TaskResult | null = null): Task {
    if (this.assigneeEmployeeId !== byEmployeeId) {
      throw new ApplicationError(
        "FORBIDDEN",
        "Only the person who holds this task can mark it done.",
      );
    }
    this.refuseClosed();
    return this.with({
      status: "done",
      doneAt: now,
      doneByEmployeeId: byEmployeeId,
      result: acceptResult(this.resultForm, result),
    });
  }

  /** `reason` is the trimmed, non-blank reason the caller checked. */
  cancel(reason: string, now: Date): Task {
    this.refuseClosed();
    return this.with({ status: "cancelled", cancelledAt: now, cancelReason: reason });
  }

  /** Only the person who asked deletes a to-do, while it is open; a feature's task stays with its feature. */
  requireDeletableBy(employeeId: string): void {
    if (this.type !== MANUAL_TO_DO) {
      throw new ApplicationError("FORBIDDEN", "A process's task cannot be deleted.");
    }
    if (this.askedByEmployeeId !== employeeId) {
      throw new ApplicationError("FORBIDDEN", "Only the person who asked can delete this task.");
    }
    this.refuseClosed();
  }

  /** Done and cancelled are final: nothing changes such a task again. */
  private refuseClosed(): void {
    if (this.status === "done") {
      throw new ApplicationError("CONFLICT", "This task is already done.");
    }
    if (this.status === "cancelled") {
      throw new ApplicationError("CONFLICT", "This task was cancelled.");
    }
  }

  private with(changes: Partial<TaskFields>): Task {
    return new Task({ ...this, ...changes });
  }
}
