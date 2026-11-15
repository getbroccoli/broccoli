import { expect, test } from "vitest";

import { Task, type TaskStatus } from "./task";
import type { TaskResultForm } from "./taskResult";

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
    result: null,
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
  ["done", "This task is already done."],
  ["cancelled", "This task was cancelled."],
] as const)("refuses to mark a %s task done", (status, message) => {
  const task = taskIn(status);

  expect(() =>
    task.markDone(task.assigneeEmployeeId, new Date("2026-11-09T12:00:00Z")),
  ).toThrowError(expect.objectContaining({ code: "CONFLICT", message }));
});

test("cancels a task to do with a reason", () => {
  const task = taskIn("to_do");
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

test("allows the asker to delete a task to do", () => {
  const task = taskIn("to_do");

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

test("stores the chosen result with its comment trimmed", () => {
  const task = taskIn("to_do", resultForm);

  const done = task.markDone(task.assigneeEmployeeId, new Date("2026-11-09T12:00:00Z"), {
    code: "no",
    comment: "  VPN login fails \n",
  });

  expect(done).toMatchObject({
    status: "done",
    result: { code: "no", comment: "VPN login fails" },
  });
  expect(task.result).toBeNull();
});

test("stores a blank optional comment as null", () => {
  const task = taskIn("to_do", resultForm);

  const done = task.markDone(task.assigneeEmployeeId, new Date("2026-11-09T12:00:00Z"), {
    code: "yes",
    comment: " \t\n ",
  });

  expect(done.result).toEqual({ code: "yes", comment: null });
});

test.each([
  {
    name: "a result without a form",
    hasForm: false,
    result: { code: "yes", comment: null },
    message: "This task does not ask for a result.",
  },
  {
    name: "a missing result",
    hasForm: true,
    result: null,
    message: "Choose a result for this task.",
  },
  {
    name: "a result its form does not list",
    hasForm: true,
    result: { code: "maybe", comment: null },
    message: "Choose one of this task's results.",
  },
  {
    name: "a missing required comment",
    hasForm: true,
    result: { code: "no", comment: null },
    message: "Add a comment to this result.",
  },
  {
    name: "a blank required comment",
    hasForm: true,
    result: { code: "no", comment: " \t\n " },
    message: "Add a comment to this result.",
  },
  {
    name: "a comment beyond 2000 characters",
    hasForm: true,
    result: { code: "yes", comment: "a".repeat(2001) },
    message: "A comment has at most 2000 characters.",
  },
])("refuses $name", ({ hasForm, result, message }) => {
  const task = taskIn("to_do", hasForm ? resultForm : null);

  expect(() =>
    task.markDone(task.assigneeEmployeeId, new Date("2026-11-09T12:00:00Z"), result),
  ).toThrowError(expect.objectContaining({ code: "INVALID_INPUT", message }));
});

function taskIn(status: TaskStatus, resultForm: TaskResultForm | null = null): Task {
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
    resultForm,
    result: null,
    doneAt: status === "done" ? closedAt : null,
    doneByEmployeeId: status === "done" ? "00000000-0000-4000-8000-000000000002" : null,
    cancelledAt: status === "cancelled" ? closedAt : null,
    cancelReason: status === "cancelled" ? "No longer needed" : null,
    createdAt,
    updatedAt: createdAt,
  });
}

const resultForm: TaskResultForm = {
  kind: "choice",
  display: "buttons",
  options: [
    { code: "yes", label: "Yes", commentRequired: false },
    { code: "no", label: "No", commentRequired: true },
  ],
};
