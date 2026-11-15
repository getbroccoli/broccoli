import { expect, test } from "vitest";

import { parseCalendarDate } from "../../../utils";
import { ProcessRun, readyStepKeys, type RunStatus, type RunStep } from "./processRun";

test("waiting steps are ready in definition order once all their listed steps are completed", () => {
  const ready = readyStepKeys(
    [
      { key: "a", after: [] },
      { key: "b", after: [] },
      { key: "d", after: ["a", "b"] },
      { key: "c", after: ["a", "b"] },
    ],
    [
      { stepKey: "c", status: "step_waiting_to_start" },
      { stepKey: "d", status: "step_waiting_to_start" },
      { stepKey: "b", status: "step_completed" },
      { stepKey: "a", status: "step_completed" },
    ],
  );

  expect(ready).toEqual(["d", "c"]);
});

test("a waiting step is not ready while one listed step still awaits its task", () => {
  const ready = readyStepKeys(
    [
      { key: "a", after: [] },
      { key: "b", after: [] },
      { key: "c", after: ["a", "b"] },
    ],
    [
      { stepKey: "a", status: "step_completed" },
      { stepKey: "b", status: "step_awaiting_task_completion" },
      { stepKey: "c", status: "step_waiting_to_start" },
    ],
  );

  expect(ready).toEqual([]);
});

test("a skipped listed step counts as done when deciding what is ready", () => {
  const ready = readyStepKeys(
    [
      { key: "a", after: [] },
      { key: "b", after: [] },
      { key: "c", after: ["a", "b"] },
    ],
    [
      { stepKey: "a", status: "step_completed" },
      { stepKey: "b", status: "step_skipped" },
      { stepKey: "c", status: "step_waiting_to_start" },
    ],
  );

  expect(ready).toEqual(["c"]);
});

test.each(["step_awaiting_task_completion", "step_completed"] as const)(
  "does not start a step already marked %s",
  (status) => {
    const ready = readyStepKeys([{ key: "a", after: [] }], [{ stepKey: "a", status }]);

    expect(ready).toEqual([]);
  },
);

test("completing the only awaiting task keeps a run with a waiting step in progress", () => {
  const run = runIn("in_progress", [step("handbook"), step("equipment", "step_waiting_to_start")]);
  const now = new Date("2026-11-09T12:00:00Z");

  const completed = run.completeTasks(new Set(["task-handbook"]), now, true);

  expect(completed).toMatchObject({ status: "in_progress", finishedAt: null });
  expect(completed.steps).toEqual([
    { ...run.steps[0], status: "step_completed", finishedAt: now },
    run.steps[1],
  ]);
});

test("cancelling a run cancels its waiting steps", () => {
  const run = runIn("in_progress", [step("handbook"), step("equipment", "step_waiting_to_start")]);
  const now = new Date("2026-11-09T12:00:00Z");

  const cancelled = run.cancel({
    cause: "cancelled_because_subject_was_removed",
    reason: "The person this process is about was removed from Broccoli.",
    byEmployeeId: null,
    now,
  });

  expect(cancelled.status).toBe("cancelled");
  expect(cancelled.steps[1]).toEqual({
    ...run.steps[1],
    status: "step_cancelled",
    taskId: null,
    finishedAt: now,
  });
});

test("completes one task while another keeps the run in progress", () => {
  const run = runIn("in_progress", [step("handbook"), step("equipment")]);
  const original = structuredClone({ ...run });
  const now = new Date("2026-11-09T12:00:00Z");

  const completed = run.completeTasks(new Set(["task-handbook"]), now, true);

  expect(completed).toBeInstanceOf(ProcessRun);
  expect(completed).not.toBe(run);
  expect(completed).toMatchObject({ status: "in_progress", finishedAt: null });
  expect(completed.steps).toEqual([
    { ...original.steps[0], status: "step_completed", finishedAt: now },
    original.steps[1],
  ]);
  expect(run).toEqual(original);
});

test("finishes the run when its last task completes", () => {
  const run = runIn("in_progress", [step("handbook", "step_completed"), step("equipment")]);
  const now = new Date("2026-11-09T12:00:00Z");

  const finished = run.completeTasks(new Set(["task-equipment"]), now, true);

  expect(finished).toMatchObject({ status: "finished", finishedAt: now });
  expect(finished.steps).toEqual([
    run.steps[0],
    { ...run.steps[1], status: "step_completed", finishedAt: now },
  ]);
});

test("counts a skipped step as done when finishing the run", () => {
  const run = runIn("in_progress", [step("handbook", "step_skipped"), step("equipment")]);
  const now = new Date("2026-11-09T12:00:00Z");

  const finished = run.completeTasks(new Set(["task-equipment"]), now, true);

  expect(finished).toMatchObject({ status: "finished", finishedAt: now });
  expect(finished.steps[0]).toEqual(run.steps[0]);
});

test("completes a task but keeps a run that cannot go on in progress", () => {
  const run = runIn("in_progress", [step("handbook")]);
  const now = new Date("2026-11-09T12:00:00Z");

  const completed = run.completeTasks(new Set(["task-handbook"]), now, false);

  expect(completed).toMatchObject({ status: "in_progress", finishedAt: null });
  expect(completed.steps).toEqual([{ ...run.steps[0], status: "step_completed", finishedAt: now }]);
});

test("completes all matching tasks together", () => {
  const run = runIn("in_progress", [step("handbook"), step("equipment")]);
  const now = new Date("2026-11-09T12:00:00Z");

  const finished = run.completeTasks(new Set(["task-handbook", "task-equipment"]), now, true);

  expect(finished).toMatchObject({ status: "finished", finishedAt: now });
  expect(finished.steps).toEqual([
    { ...run.steps[0], status: "step_completed", finishedAt: now },
    { ...run.steps[1], status: "step_completed", finishedAt: now },
  ]);
});

test("leaves steps not awaiting tasks unchanged when their tasks complete", () => {
  const run = runIn("in_progress", [
    step("handbook", "step_completed"),
    step("equipment", "step_skipped"),
    step("introduction", "step_cancelled"),
    step("training"),
  ]);
  const original = structuredClone({ ...run });

  const completed = run.completeTasks(
    new Set(["task-handbook", "task-introduction", "unrelated-task"]),
    new Date("2026-11-09T12:00:00Z"),
    true,
  );

  expect(completed.steps).toEqual(original.steps);
  expect(completed.status).toBe("in_progress");
  expect(run).toEqual(original);
});

test("refuses to complete tasks of a cancelled run", () => {
  const run = runIn("cancelled", [step("handbook", "step_cancelled")]);

  expect(() =>
    run.completeTasks(new Set(["task-handbook"]), new Date("2026-11-09T12:00:00Z"), true),
  ).toThrowError(
    expect.objectContaining({ code: "CONFLICT", message: "This process was cancelled." }),
  );
});

test("reports a removed subject before a missing step task", () => {
  const run = runIn("in_progress", [{ ...step("handbook"), taskId: null }]);

  expect(run.removal(false)).toEqual({
    cause: "cancelled_because_subject_was_removed",
    stepKey: null,
  });
});

test("reports an awaiting step whose task is gone", () => {
  const run = runIn("in_progress", [step("handbook"), { ...step("equipment"), taskId: null }]);

  expect(run.removal(true)).toEqual({
    cause: "cancelled_because_step_assignee_was_removed",
    stepKey: "equipment",
  });
});

test("does not cancel for a completed step whose task is gone", () => {
  const run = runIn("in_progress", [
    { ...step("handbook", "step_completed"), taskId: null },
    step("equipment"),
  ]);

  expect(run.removal(true)).toBeNull();
});

test.each(["finished", "cancelled"] as const)("does not report removal for a %s run", (status) => {
  const run = runIn(status, [
    {
      ...step("handbook", status === "finished" ? "step_completed" : "step_cancelled"),
      taskId: null,
    },
  ]);

  expect(run.removal(false)).toBeNull();
});

test("cancels awaiting steps and keeps completed and skipped steps", () => {
  const run = runIn("in_progress", [
    step("handbook"),
    step("equipment", "step_completed"),
    step("introduction", "step_skipped"),
    { ...step("training"), taskId: null },
  ]);
  const original = structuredClone({ ...run });
  const now = new Date("2026-11-09T12:00:00Z");

  const cancelled = run.cancel({
    cause: "cancelled_because_subject_was_removed",
    reason: "The person this process is about was removed from Broccoli.",
    byEmployeeId: "employee-admin",
    now,
  });

  expect(cancelled).toBeInstanceOf(ProcessRun);
  expect(cancelled).not.toBe(run);
  expect(cancelled).toMatchObject({
    status: "cancelled",
    finishedAt: null,
    cancelledAt: now,
    cancelledByEmployeeId: "employee-admin",
    cancelCause: "cancelled_because_subject_was_removed",
    cancelReason: "The person this process is about was removed from Broccoli.",
  });
  expect(cancelled.steps).toEqual([
    { ...original.steps[0], status: "step_cancelled", finishedAt: now },
    original.steps[1],
    original.steps[2],
    { ...original.steps[3], status: "step_cancelled", finishedAt: now },
  ]);
  expect(run).toEqual(original);
});

test.each(["finished", "cancelled"] as const)("refuses to cancel a %s run", (status) => {
  const run = runIn(status, []);

  expect(() =>
    run.cancel({
      cause: "cancelled_because_subject_was_removed",
      reason: "The person this process is about was removed from Broccoli.",
      byEmployeeId: null,
      now: new Date("2026-11-09T12:00:00Z"),
    }),
  ).toThrowError(
    expect.objectContaining({
      code: "CONFLICT",
      message: "Only a run in progress can be cancelled.",
    }),
  );
});

test("lists only the tasks of awaiting steps that still have a task", () => {
  const run = runIn("in_progress", [
    step("handbook"),
    step("equipment", "step_completed"),
    step("introduction", "step_skipped"),
    step("training", "step_cancelled"),
    { ...step("access"), taskId: null },
    step("welcome"),
  ]);

  expect(run.openTaskIds()).toEqual(["task-handbook", "task-welcome"]);
});

function runIn(status: RunStatus, steps: readonly RunStep[]): ProcessRun {
  const createdAt = new Date("2026-11-01T12:00:00Z");
  const closedAt = new Date("2026-11-08T12:00:00Z");
  return ProcessRun.restore(
    {
      id: "run-onboarding",
      processId: "process-onboarding",
      processVersionId: "version-onboarding",
      recordType: "employee",
      recordId: "employee-subject",
      subjectEmployeeId: "employee-subject",
      startCause: "started_by_admin",
      startedByEmployeeId: "employee-admin",
      triggerDate: null,
      startKey: null,
      triggerEvent: null,
      startDay: parseCalendarDate("2026-11-01")!,
      status,
      finishedAt: status === "finished" ? closedAt : null,
      cancelledAt: status === "cancelled" ? closedAt : null,
      cancelledByEmployeeId: null,
      cancelCause: status === "cancelled" ? "cancelled_because_subject_was_removed" : null,
      cancelReason:
        status === "cancelled"
          ? "The person this process is about was removed from Broccoli."
          : null,
      createdAt,
      updatedAt: createdAt,
    },
    steps,
  );
}

function step(
  stepKey: string,
  status: RunStep["status"] = "step_awaiting_task_completion",
): RunStep {
  return {
    runId: "run-onboarding",
    stepKey,
    status,
    taskId:
      status === "step_skipped" || status === "step_waiting_to_start" ? null : `task-${stepKey}`,
    assigneeNote: null,
    skipReason: status === "step_skipped" ? "no_assignee_for_step" : null,
    finishedAt:
      status === "step_awaiting_task_completion" || status === "step_waiting_to_start"
        ? null
        : new Date("2026-11-08T12:00:00Z"),
  };
}
