import type { Orm } from "../../src/core/db";
import { type NewTaskRow, taskRepository } from "../../src/core/tasks/db";
import { testTransactor } from "./testTransactor";

export function seedTask(
  orm: Orm,
  overrides: Pick<NewTaskRow, "assigneeEmployeeId" | "title"> & Partial<NewTaskRow>,
) {
  return testTransactor(orm)(async (tx) => {
    const [task] = await taskRepository(tx).insert([
      {
        type: "manual_to_do",
        status: "to_do",
        description: null,
        // A manual to-do always has someone who asked: its assignee, unless the test names another.
        askedByEmployeeId:
          overrides.type && overrides.type !== "manual_to_do" ? null : overrides.assigneeEmployeeId,
        subjectEmployeeId: null,
        record: null,
        dueDate: null,
        resultForm: null,
        result: null,
        doneAt: null,
        doneByEmployeeId: null,
        cancelledAt: null,
        cancelReason: null,
        ...overrides,
      },
    ]);
    return task!;
  });
}
