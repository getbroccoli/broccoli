import { invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import { createRecordHistoryService, type CauseKinds } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import type { CalendarDate } from "../../../utils";
import { type NewTaskRow, taskRepository } from "../db";
import type { Task, TaskProcessSource, TaskRecord, TaskType } from "../domain";

/** A task a feature, a process step or the demo asks of someone: a person who asked, a process step, or both. */
export type NewTask = NewTaskFields &
  (
    | { askedByEmployeeId: string; processSource?: TaskProcessSource | null }
    | { askedByEmployeeId?: null; processSource: TaskProcessSource }
  );

interface NewTaskFields {
  type: TaskType;
  title: string;
  description?: string | null;
  assigneeEmployeeId: string;
  subjectEmployeeId?: string | null;
  record?: TaskRecord | null;
  dueDate?: CalendarDate | null;
  /** Why the task exists, for its history; a direct edit when left out. */
  cause?: TaskCause;
}

/** The cause a task's history line records. */
export type TaskCause = { kind: keyof CauseKinds; ref?: string | null };

/** Inserts the tasks to do, appends their history lines and publishes their creation. */
export async function createTasks(
  ctx: SecurityContext,
  tx: Tx,
  newTasks: readonly NewTask[],
): Promise<Task[]> {
  const created = await taskRepository(tx).insert(newTasks.map(newTaskRow));
  await history.append(ctx, tx, {
    recordType: "task",
    operation: "CREATED",
    cause: DIRECT_EDIT,
    records: created.map((task, index) => ({
      recordId: task.id,
      cause: newTasks[index]!.cause ?? DIRECT_EDIT,
      changes: [
        { field: "title", oldValue: null, newValue: task.title },
        { field: "status", oldValue: null, newValue: task.status },
      ],
    })),
  });
  for (const task of created) {
    tx.publish("tasks.task_created", {
      taskId: task.id,
      assigneeEmployeeId: task.assigneeEmployeeId,
      askedByEmployeeId: task.askedByEmployeeId,
      subjectEmployeeId: task.subjectEmployeeId,
      processKey: task.processSource?.processKey ?? null,
      byEmployeeId: ctx.user?.employeeId ?? null,
    });
  }
  return created;
}

function newTaskRow({ title, description = null, ...task }: NewTask): NewTaskRow {
  return {
    type: task.type,
    status: "to_do",
    title: requireText(title, "title"),
    description: description?.trim() || null,
    assigneeEmployeeId: task.assigneeEmployeeId,
    askedByEmployeeId: task.askedByEmployeeId ?? null,
    subjectEmployeeId: task.subjectEmployeeId ?? null,
    processSource: task.processSource ?? null,
    record: task.record ?? null,
    dueDate: task.dueDate ?? null,
    doneAt: null,
    doneByEmployeeId: null,
    cancelledAt: null,
    cancelReason: null,
  };
}

/** The text trimmed, refused as invalid input when blank. */
export function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw invalidInput([{ field, code: "required" }]);
  }
  return trimmed;
}

/** A change a person made directly, the cause of most task history lines. */
export const DIRECT_EDIT: TaskCause = { kind: "EDITED_DIRECTLY" };

const history = createRecordHistoryService();
