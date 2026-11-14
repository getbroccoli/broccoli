import { expect, test } from "vitest";

import { Task, type TaskStatus } from "./task";

test("marks a task to do as done by its assignee", () => {
  const task = taskIn("to_do");
  const original = { ...task };
  const now = new Date("2026-11-09T12:00:00Z");

  const done = task.markDone(task.assigneeEmployeeId, now);

  expect(done).toBeInstanceOf(Task);
  expect(done).toMatchObject({
    status: "done",
    doneAt: now,
    doneByEmployeeId: task.assigneeEmployeeId,
    cancelledAt: null,
    cancelReason: null,
  });
  expect(task).toEqual(original);
});

test("refuses to mark a task done by someone other than its assignee", () => {
  const task = taskIn("to_do");

  expect(() =>
    task.markDone("00000000-0000-4000-8000-000000000003", new Date("2026-11-09T12:00:00Z")),
  ).toThrowError(
    expect.objectContaining({
      code: "FORBIDDEN",
      message: "Only the person who holds this task can mark it done.",
    }),
  );
});

test.each([
  ["waiting", "This task is waiting."],
  ["done", "This task is already done."],
  ["cancelled", "This task was cancelled."],
] as const)("refuses to mark a %s task done", (status, message) => {
  const task = taskIn(status);

  expect(() =>
    task.markDone(task.assigneeEmployeeId, new Date("2026-11-09T12:00:00Z")),
  ).toThrowError(expect.objectContaining({ code: "CONFLICT", message }));
});

test.each(["to_do", "waiting"] as const)("cancels a %s task with a reason", (status) => {
  const task = taskIn(status);
  const original = { ...task };
  const now = new Date("2026-11-09T12:00:00Z");

  const cancelled = task.cancel("No longer needed", now);

  expect(cancelled).toBeInstanceOf(Task);
  expect(cancelled).toMatchObject({
    status: "cancelled",
    cancelledAt: now,
    cancelReason: "No longer needed",
    doneAt: null,
    doneByEmployeeId: null,
  });
  expect(task).toEqual(original);
});

test.each([
  ["done", "This task is already done."],
  ["cancelled", "This task was cancelled."],
] as const)("refuses to cancel a %s task", (status, message) => {
  const task = taskIn(status);

  expect(() => task.cancel("No longer needed", new Date("2026-11-09T12:00:00Z"))).toThrowError(
    expect.objectContaining({ code: "CONFLICT", message }),
  );
});

test("puts a task to do into waiting", () => {
  const task = taskIn("to_do");
  const original = { ...task };

  const waiting = task.markWaiting();

  expect(waiting).toBeInstanceOf(Task);
  expect(waiting.status).toBe("waiting");
  expect(task).toEqual(original);
});

test.each([
  ["waiting", "Only a task to do can wait."],
  ["done", "Only a task to do can wait."],
  ["cancelled", "This task was cancelled."],
] as const)("refuses to put a %s task into waiting", (status, message) => {
  const task = taskIn(status);

  expect(() => task.markWaiting()).toThrowError(
    expect.objectContaining({
      code: "CONFLICT",
      message,
    }),
  );
});

test("shows a task to its assignee", () => {
  const task = taskIn("to_do");

  expect(task.isVisibleTo(task.assigneeEmployeeId)).toBe(true);
});

test("shows a task to its asker", () => {
  const task = taskIn("to_do");

  expect(task.isVisibleTo("00000000-0000-4000-8000-000000000003")).toBe(true);
});

test("hides a task from its subject", () => {
  const task = taskIn("to_do");

  expect(task.isVisibleTo("00000000-0000-4000-8000-000000000004")).toBe(false);
});

test.each(["to_do", "waiting"] as const)("allows the asker to delete a %s task", (status) => {
  const task = taskIn(status);

  expect(() => task.requireDeletableBy("00000000-0000-4000-8000-000000000003")).not.toThrow();
});

test("refuses to let the assignee delete a task asked by someone else", () => {
  const task = taskIn("to_do");

  expect(() => task.requireDeletableBy(task.assigneeEmployeeId)).toThrowError(
    expect.objectContaining({
      code: "FORBIDDEN",
      message: "Only the person who asked can delete this task.",
    }),
  );
});

test.each([
  ["done", "This task is already done."],
  ["cancelled", "This task was cancelled."],
] as const)("refuses to let the asker delete a %s task", (status, message) => {
  const task = taskIn(status);

  expect(() => task.requireDeletableBy("00000000-0000-4000-8000-000000000003")).toThrowError(
    expect.objectContaining({ code: "CONFLICT", message }),
  );
});

function taskIn(status: TaskStatus): Task {
  const createdAt = new Date("2026-11-01T12:00:00Z");
  const closedAt = new Date("2026-11-08T12:00:00Z");
  return Task.restore({
    id: "00000000-0000-4000-8000-000000000001",
    type: "manual_to_do",
    status,
    title: "Read the handbook",
    description: null,
    assigneeEmployeeId: "00000000-0000-4000-8000-000000000002",
    askedByEmployeeId: "00000000-0000-4000-8000-000000000003",
    subjectEmployeeId: "00000000-0000-4000-8000-000000000004",
    record: null,
    dueDate: null,
    doneAt: status === "done" ? closedAt : null,
    doneByEmployeeId: status === "done" ? "00000000-0000-4000-8000-000000000002" : null,
    cancelledAt: status === "cancelled" ? closedAt : null,
    cancelReason: status === "cancelled" ? "No longer needed" : null,
    createdAt,
    updatedAt: createdAt,
  });
}
