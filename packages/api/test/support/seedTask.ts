import type { Orm } from "../../src/core/db";
import { type NewTaskRow, taskRepository } from "../../src/modules/tasks/db";
import { testTransactor } from "./testTransactor";

export function seedTask(
  orm: Orm,
  overrides: Pick<NewTaskRow, "assigneeEmployeeId" | "title"> & Partial<NewTaskRow>,
) {
  return testTransactor(orm)((tx) =>
    taskRepository(tx).insert({
      type: "manual_to_do",
      status: "to_do",
      description: null,
      requestedByEmployeeId: null,
      aboutEmployeeId: null,
      processSource: null,
      subject: null,
      dueDate: null,
      doneAt: null,
      doneByEmployeeId: null,
      cancelledAt: null,
      cancelReason: null,
      ...overrides,
    }),
  );
}
