import type { Orm } from "../../db";
import type { EmailTemplate } from "../../../integrations/mail";
import { parseUuid } from "../../../utils";
import { taskRepository } from "../db";
import type { Task } from "../domain";
import { TASK_ASSIGNED_TEMPLATE, type TaskAssignedValues } from "./taskAssigned.email";
import { TASK_DONE_TEMPLATE, type TaskDoneValues } from "./taskDone.email";

import type { TaskEmailContext } from "./taskEmailContext";

/** A task email, and how to read its values for one recipient; null drops it. */
interface TaskEmail<Values> {
  template: EmailTemplate<Values & TaskEmailContext>;
  readValues(
    taskId: string,
    recipientEmployeeId: string,
  ): Promise<{ values: Values; senderName: string | null } | null>;
}

/** Employees' full names by id, as the employees module reads them. */
export type ReadEmployeeNames = (ids: readonly string[]) => Promise<Map<string, string>>;

/**
 * The emails tasks registers for notify steps; each reads the task as it is now and drops it
 * when the task is gone or its recipient no longer sees it.
 */
export function taskEmailTemplates({
  orm,
  readEmployeeNames,
}: {
  orm: Orm;
  readEmployeeNames: ReadEmployeeNames;
}): {
  "tasks.task_assigned": TaskEmail<TaskAssignedValues>;
  "tasks.task_done": TaskEmail<TaskDoneValues>;
} {
  const assigned: TaskEmail<TaskAssignedValues> = {
    template: TASK_ASSIGNED_TEMPLATE,
    async readValues(taskId, recipientEmployeeId) {
      const task = await readVisible(orm, taskId, recipientEmployeeId);
      if (!task) return null;
      const { id, title, description, dueDate, askedByEmployeeId } = task;
      const names = await readEmployeeNames(askedByEmployeeId ? [askedByEmployeeId] : []);
      const askedByName = askedByEmployeeId ? (names.get(askedByEmployeeId) ?? null) : null;
      return {
        values: { taskId: id, title, description, dueDate, askedByName },
        senderName: askedByName,
      };
    },
  };
  const done: TaskEmail<TaskDoneValues> = {
    template: TASK_DONE_TEMPLATE,
    async readValues(taskId, recipientEmployeeId) {
      const task = await readVisible(orm, taskId, recipientEmployeeId);
      if (task?.status !== "done" || !task.doneAt || !task.doneByEmployeeId) return null;
      const doneByName = (await readEmployeeNames([task.doneByEmployeeId])).get(
        task.doneByEmployeeId,
      );
      if (!doneByName) return null;
      return {
        values: { taskId: task.id, title: task.title, doneByName, doneAt: task.doneAt },
        senderName: doneByName,
      };
    },
  };
  return { "tasks.task_assigned": assigned, "tasks.task_done": done };
}

/** The task, if the employee holds it or asked for it. */
async function readVisible(orm: Orm, taskId: string, employeeId: string): Promise<Task | null> {
  const id = parseUuid(taskId);
  const [task] = id ? await taskRepository(orm).findByIds([id]) : [];
  return task?.isVisibleTo(employeeId) ? task : null;
}
