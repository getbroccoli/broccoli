import { expect, it } from "vitest";

import { dueText, formatTaskDay, isLate, taskFact, taskSource, type TaskRow } from "./taskText";

it("formats a calendar date as a weekday, day and month", () => {
  expect(formatTaskDay("2026-11-10")).toBe("Tue 10 Nov");
});

it("formats an ISO date-time using its local calendar day", () => {
  const dateTime = new Date(2026, 10, 10, 12).toISOString();

  expect(formatTaskDay(dateTime)).toBe("Tue 10 Nov");
});

it.each(["TO_DO", "WAITING"] as const)("marks a %s task due before today as late", (status) => {
  const task = taskWith({ status, dueDate: "2026-11-09" });

  expect(isLate(task, "2026-11-10")).toBe(true);
});

it("does not mark a done task as late", () => {
  const task = taskWith({
    status: "DONE",
    dueDate: "2026-11-09",
    doneAt: completedAt,
    doneBy: holder,
  });

  expect(isLate(task, "2026-11-10")).toBe(false);
});

it("does not mark a cancelled task as late", () => {
  const task = taskWith({
    status: "CANCELLED",
    dueDate: "2026-11-09",
    cancelledAt: completedAt,
    cancelReason: "No longer needed",
  });

  expect(isLate(task, "2026-11-10")).toBe(false);
});

it("does not mark a task due today as late", () => {
  const task = taskWith({ dueDate: "2026-11-10" });

  expect(isLate(task, "2026-11-10")).toBe(false);
});

it("does not mark a task due in the future as late", () => {
  const task = taskWith({ dueDate: "2026-11-11" });

  expect(isLate(task, "2026-11-10")).toBe(false);
});

it("does not mark a task without a due date as late", () => {
  expect(isLate(taskWith(), "2026-11-10")).toBe(false);
});

it("says when you completed a task", () => {
  const task = taskWith({ status: "DONE", doneAt: completedAt, doneBy: holder });

  expect(taskFact(task, holder.id)).toBe("Done by you · Tue 10 Nov");
});

it("names the person who completed a task for someone else", () => {
  const task = taskWith({ status: "DONE", doneAt: completedAt, doneBy: holder });

  expect(taskFact(task, asker.id)).toBe("Done by Mia Reed · Tue 10 Nov");
});

it("shows why a task was cancelled", () => {
  const task = taskWith({
    status: "CANCELLED",
    cancelledAt: completedAt,
    cancelReason: "No longer needed",
  });

  expect(taskFact(task, holder.id)).toBe("Cancelled: No longer needed");
});

it("shows that a task is waiting even when it is overdue", () => {
  const task = taskWith({ status: "WAITING", dueDate: "2026-11-09" });

  expect(taskFact(task, holder.id)).toBe("Waiting");
});

it("names the holder when someone else holds an open task", () => {
  const task = taskWith({ dueDate: "2026-11-09" });

  expect(taskFact(task, asker.id)).toBe("With Mia Reed");
});

it("shows the description of a task to do that you hold", () => {
  const task = taskWith({ description: "Read before Monday.", dueDate: "2026-11-13" });

  expect(taskFact(task, holder.id)).toBe("Read before Monday.");
});

it("shows no fact for a task to do that you hold without a description", () => {
  const task = taskWith({ dueDate: "2026-11-13" });

  expect(taskFact(task, holder.id)).toBe("");
});

it("shows the due date of a task", () => {
  const task = taskWith({ dueDate: "2026-11-13" });

  expect(dueText(task, "2026-11-10")).toBe("Due Fri 13 Nov");
});

it("shows when a task became late", () => {
  const task = taskWith({ dueDate: "2026-11-06" });

  expect(dueText(task, "2026-11-10")).toBe("Late, was Fri 6 Nov");
});

it("says when a task has no due date", () => {
  expect(dueText(taskWith(), "2026-11-10")).toBe("No due date");
});

it("names the person who asked for a task", () => {
  expect(taskSource(taskWith(), holder.id)).toBe("Sam Lee");
});

it("says you when you asked for a task", () => {
  expect(taskSource(taskWith(), asker.id)).toBe("You");
});

it("shows the process and step when no person asked for a task", () => {
  const task = taskWith({
    requestedBy: null,
    processSource: { processKey: "onboarding", stepKey: "read_handbook" },
  });

  expect(taskSource(task, holder.id)).toBe("onboarding · read_handbook");
});

function taskWith(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "task-1",
    type: "MANUAL_TO_DO",
    status: "TO_DO",
    title: "Read the handbook",
    description: null,
    dueDate: null,
    createdAt: "2026-11-01T12:00:00Z",
    doneAt: null,
    doneBy: null,
    cancelledAt: null,
    cancelReason: null,
    processSource: null,
    assignee: holder,
    requestedBy: asker,
    about: null,
    ...overrides,
  };
}

const holder = { id: "holder", firstName: "Mia", lastName: "Reed", avatarUrl: null };
const asker = { id: "asker", firstName: "Sam", lastName: "Lee", avatarUrl: null };
const completedAt = new Date(2026, 10, 10, 12).toISOString();
