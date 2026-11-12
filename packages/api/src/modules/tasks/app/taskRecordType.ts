import type { Orm } from "../../../core/db";
import type { RecordTypeRegistration } from "../../../core/records";
import { parseUuid } from "../../../utils";
import { taskRepository } from "../db";
import { isTaskVisibleTo } from "../domain";

/** How core reads a task's history: only its assignee and the person who asked, as for the task. */
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
  };
}
