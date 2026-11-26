import { expect, it } from "vitest";

import {
  countTasksNeedingYou,
  dueText,
  formatTaskDay,
  isLate,
  processRunDetail,
  taskFact,
  taskSource,
  type TaskRow,
} from "./taskText";

it("formats a calendar date as a weekday, day and month", () => {
  expect(formatTaskDay("2026-11-10")).toBe("Tue 10 Nov");
});

it("formats an ISO date-time using its local calendar day", () => {
  const dateTime = new Date(2026, 10, 10, 12).toISOString();

  expect(formatTaskDay(dateTime)).toBe("Tue 10 Nov");
});

it("marks a task to do due before today as late", () => {
  const task = taskWith({ dueDate: "2026-11-09" });

  expect(isLate(task, "2026-11-10")).toBe(true);
});

it("does not mark a done task as late", () => {
  const task = taskWith({
    status: "DONE",
    dueDate: "2026-11-09",
    doneAt: completedAt,
    doneBy: assignee,
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
  const task = taskWith({ status: "DONE", doneAt: completedAt, doneBy: assignee });

  expect(taskFact(task, assignee.id)).toBe("Done by you · Tue 10 Nov");
});

it("names the person who completed a task for someone else", () => {
  const task = taskWith({ status: "DONE", doneAt: completedAt, doneBy: assignee });

  expect(taskFact(task, asker.id)).toBe("Done by Mia Park · Tue 10 Nov");
});

it("shows why a task was cancelled", () => {
  const task = taskWith({
    status: "CANCELLED",
    cancelledAt: completedAt,
    cancelReason: "No longer needed",
  });

  expect(taskFact(task, assignee.id)).toBe("Cancelled: No longer needed");
});

it("names the assignee when someone else holds an open task", () => {
  const task = taskWith({ dueDate: "2026-11-09" });

  expect(taskFact(task, asker.id)).toBe("With Mia Park");
});

it("shows the description of a task to do that you hold", () => {
  const task = taskWith({ description: "Read before Monday.", dueDate: "2026-11-13" });

  expect(taskFact(task, assignee.id)).toBe("Read before Monday.");
});

it("shows no fact for a task to do that you hold without a description", () => {
  const task = taskWith({ dueDate: "2026-11-13" });

  expect(taskFact(task, assignee.id)).toBe("");
});

it("shows the due date of a task", () => {
  const task = { ...taskWith(), dueDate: "2026-11-13" };

  expect(dueText(task, "2026-11-10")).toBe("Due Fri 13 Nov");
});

it("shows when a task became late", () => {
  const task = { ...taskWith(), dueDate: "2026-11-06" };

  expect(dueText(task, "2026-11-10")).toBe("Late, was Fri 6 Nov");
});

it("names the person who asked for a task", () => {
  expect(taskSource(taskWith(), assignee.id)).toBe("Sam Lee");
});

it("says you when you asked for a task", () => {
  expect(taskSource(taskWith(), asker.id)).toBe("You");
});

it("shows no source for a task with neither an asker nor a process", () => {
  const task = taskWith({ askedBy: null, processRun: null });

  expect(taskSource(task, assignee.id)).toBe("");
});

it("names the process when no person asked for a task", () => {
  const task = taskWith({
    askedBy: null,
    processRun: runWith({ processName: "Onboarding example" }),
  });

  expect(taskSource(task, assignee.id)).toBe("Onboarding example");
});

it("names who decided the outcome and on which day", () => {
  const task = taskWith({ status: "DONE", processRun: runWith({ ...finishedRun, outcome }) });

  expect(processRunDetail(task, asker.id)).toBe("By Mia Park on Fri 27 Nov");
});

it("shows the decision day when the decider is unknown", () => {
  const task = taskWith({
    status: "DONE",
    processRun: runWith({ ...finishedRun, outcome: { ...outcome, decidedBy: null } }),
  });

  expect(processRunDetail(task, asker.id)).toBe("On Fri 27 Nov");
});

it("tells the assignee their open task is waiting for their decision", () => {
  const task = taskWith({ processRun: runWith({ decidesOutcome: true }) });

  expect(processRunDetail(task, assignee.id)).toBe("Waiting for your decision");
});

it("tells the requester who holds the decision and since when", () => {
  const task = taskWith({ createdAt: requestedAt, processRun: runWith({ decidesOutcome: true }) });

  expect(processRunDetail(task, asker.id)).toBe("With Mia Park since Thu 26 Nov");
});

it("counts completed steps for an in-progress task that does not decide the outcome", () => {
  const task = taskWith({ processRun: runWith({ doneSteps: 2, totalSteps: 3 }) });

  expect(processRunDetail(task, assignee.id)).toBe("2 of 3 steps done");
});

it("shows the cancellation day and missing decision on the outcome step", () => {
  const task = taskWith({
    status: "CANCELLED",
    processRun: runWith({ status: "CANCELLED", endedAt: decisionDay, decidesOutcome: true }),
  });

  expect(processRunDetail(task, asker.id)).toBe("On Fri 27 Nov, with no decision");
});

it("shows the cancellation day alone on a step that does not decide the outcome", () => {
  const task = taskWith({
    status: "CANCELLED",
    processRun: runWith({ status: "CANCELLED", endedAt: decisionDay }),
  });

  expect(processRunDetail(task, asker.id)).toBe("On Fri 27 Nov");
});

it("shows the end day for a finished run without an outcome", () => {
  const task = taskWith({
    status: "DONE",
    processRun: runWith({ status: "FINISHED", endedAt: decisionDay }),
  });

  expect(processRunDetail(task, asker.id)).toBe("On Fri 27 Nov");
});

it("counts a task to do that you hold in needs you", () => {
  const groups = { needsYou: [taskWith()], waitingOnOthers: [], resolvedRecently: [] };

  expect(countTasksNeedingYou(groups, assignee.id)).toBe(1);
});

it("does not count a task marked done in place in needs you", () => {
  const task = taskWith({ status: "DONE", doneAt: completedAt, doneBy: assignee });
  const groups = { needsYou: [task], waitingOnOthers: [], resolvedRecently: [] };

  expect(countTasksNeedingYou(groups, assignee.id)).toBe(0);
});

it("does not count a task to do that someone else holds", () => {
  const task = taskWith({ assignee: asker, askedBy: assignee });
  const groups = { needsYou: [], waitingOnOthers: [task], resolvedRecently: [] };

  expect(countTasksNeedingYou(groups, assignee.id)).toBe(0);
});

it("counts no tasks for a viewer without an employee", () => {
  const groups = { needsYou: [taskWith()], waitingOnOthers: [], resolvedRecently: [] };

  expect(countTasksNeedingYou(groups, null)).toBe(0);
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
    resultForm: null,
    result: null,
    processRun: null,
    assignee: assignee,
    askedBy: asker,
    subject: null,
    ...overrides,
  };
}

type ProcessRun = NonNullable<TaskRow["processRun"]>;

function runWith(overrides: Partial<ProcessRun>): ProcessRun {
  return {
    processName: "Manager approval",
    status: "IN_PROGRESS",
    endedAt: null,
    doneSteps: 0,
    totalSteps: 1,
    decidesOutcome: false,
    outcome: null,
    ...overrides,
  };
}

const assignee = { id: "assignee", firstName: "Mia", lastName: "Park", avatarUrl: null };
const asker = { id: "asker", firstName: "Sam", lastName: "Lee", avatarUrl: null };
const completedAt = new Date(2026, 10, 10, 12).toISOString();
const requestedAt = new Date(2026, 10, 26, 12).toISOString();
const decisionDay = new Date(2026, 10, 27, 12).toISOString();
const finishedRun = {
  status: "FINISHED",
  endedAt: new Date(2026, 10, 28, 12).toISOString(),
  decidesOutcome: true,
  doneSteps: 2,
  totalSteps: 2,
} as const;
const outcome = {
  code: "approved",
  label: "Approved",
  comment: null,
  decidedAt: decisionDay,
  decidedBy: assignee,
};
