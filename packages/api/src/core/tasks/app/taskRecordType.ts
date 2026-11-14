import type { Orm } from "../../db";
import type { RecordTypeRegistration } from "../../records";
import { parseUuid } from "../../../utils";
import { taskRepository } from "../db";
import { isTaskVisibleTo } from "../domain";

/**
 * How core reads a task's history: only its assignee and the person who asked, as for the task;
 * and how a process reads the task it runs on.
 */
export function taskRecordType(orm: Orm): RecordTypeRegistration {
  return {
    graphqlType: "Task",
    canonicalId: parseUuid,
    loadRecords: async (ids) => {
      const tasks = await taskRepository(orm).findByIds(ids);
      return new Map(tasks.map((task) => [task.id, task]));
    },
    readableIds: async (ctx, ids) => {
      const employeeId = ctx.user?.employeeId;
      if (!employeeId) return new Set();
      const tasks = await taskRepository(orm).findByIds(ids);
      return new Set(tasks.filter((task) => isTaskVisibleTo(task, employeeId)).map(({ id }) => id));
    },
    // A process on a task is about the task's subject, who gains no access to the task by it.
    processes: {
      readSubjects: async (tx, ids) => {
        const tasks = await taskRepository(tx).findByIds(ids);
        return new Map(tasks.map(({ id, subjectEmployeeId }) => [id, subjectEmployeeId]));
      },
    },
  };
}
