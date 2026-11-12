import { expect, test } from "vitest";

import {
  cancelTask,
  markTaskDone,
  markTaskWaiting,
  reopenTask,
  type Task,
  type TaskStatus,
} from "./task";

test("marks a task to do as done by its assignee", () => {
  const task = taskIn("to_do");
  const now = new Date("2026-11-09T12:00:00Z");

  const done = markTaskDone(task, task.assigneeEmployeeId, now);

  expect(done).toMatchObject({
    status: "done",
    doneAt: now,
    doneByEmployeeId: task.assigneeEmployeeId,
    cancelledAt: null,
    cancelReason: null,
  });
  expect(task.status).toBe("to_do");
});

test.each([
  ["waiting", "This task is waiting."],
  ["done", "This task is already done."],
  ["cancelled", "This task was cancelled."],
] as const)("refuses to mark a %s task done", (status, message) => {
  const task = taskIn(status);

  expect(() =>
    markTaskDone(task, task.assigneeEmployeeId, new Date("2026-11-09T12:00:00Z")),
  ).toThrowError(expect.objectContaining({ code: "CONFLICT", message }));
});

test("reopens a done task and clears who completed it and when", () => {
  const task = taskIn("done");

  const reopened = reopenTask(task);

  expect(reopened).toMatchObject({ status: "to_do", doneAt: null, doneByEmployeeId: null });
  expect(task.status).toBe("done");
});

test.each(["to_do", "waiting", "cancelled"] as const)("refuses to reopen a %s task", (status) => {
  expect(() => reopenTask(taskIn(status))).toThrowError(
    expect.objectContaining({
      code: "CONFLICT",
      message: "Only a done task can be reopened.",
    }),
  );
});

test.each(["to_do", "waiting"] as const)("cancels a %s task with a reason", (status) => {
  const task = taskIn(status);
  const now = new Date("2026-11-09T12:00:00Z");

  const cancelled = cancelTask(task, "No longer needed", now);

  expect(cancelled).toMatchObject({
    status: "cancelled",
    cancelledAt: now,
    cancelReason: "No longer needed",
    doneAt: null,
    doneByEmployeeId: null,
  });
  expect(task.status).toBe(status);
});

test.each([
  ["done", "This task is already done."],
  ["cancelled", "This task was cancelled."],
] as const)("refuses to cancel a %s task", (status, message) => {
  expect(() =>
    cancelTask(taskIn(status), "No longer needed", new Date("2026-11-09T12:00:00Z")),
  ).toThrowError(expect.objectContaining({ code: "CONFLICT", message }));
});

test("puts a task to do into waiting", () => {
  const task = taskIn("to_do");

  expect(markTaskWaiting(task).status).toBe("waiting");
  expect(task.status).toBe("to_do");
});

test.each([
  ["waiting", "Only a task to do can wait."],
  ["done", "Only a task to do can wait."],
  ["cancelled", "This task was cancelled."],
] as const)("refuses to put a %s task into waiting", (status, message) => {
  expect(() => markTaskWaiting(taskIn(status))).toThrowError(
    expect.objectContaining({
      code: "CONFLICT",
      message,
    }),
  );
});

function taskIn(status: TaskStatus): Task {
  const createdAt = new Date("2026-11-01T12:00:00Z");
  const closedAt = new Date("2026-11-08T12:00:00Z");
  return {
    id: "00000000-0000-4000-8000-000000000001",
    type: "manual_to_do",
    status,
    title: "Read the handbook",
    description: null,
    assigneeEmployeeId: "00000000-0000-4000-8000-000000000002",
    askedByEmployeeId: "00000000-0000-4000-8000-000000000003",
    subjectEmployeeId: null,
    processSource: null,
    record: null,
    dueDate: null,
    doneAt: status === "done" ? closedAt : null,
    doneByEmployeeId: status === "done" ? "00000000-0000-4000-8000-000000000002" : null,
    cancelledAt: status === "cancelled" ? closedAt : null,
    cancelReason: status === "cancelled" ? "No longer needed" : null,
    createdAt,
    updatedAt: createdAt,
  };
}
