import { expect, test } from "vitest";

import type { ActionStep, ProcessStep, TaskStep } from "./processDefinition";
import { startReadySteps, type RunStep } from "./processRun";

test("completes a ready action and starts the task after it in the same call", () => {
  const action = actionStep("tell_owner", [{ step: "prepare", when: null }]);
  const check = taskStep("check", [{ step: "tell_owner", when: null }]);
  const steps: ProcessStep[] = [taskStep("prepare"), action, check];
  const progress: RunStep[] = [
    { ...row("prepare"), status: "step_completed", taskId: "task-prepare", finishedAt: now },
    row("tell_owner"),
    row("check"),
  ];
  const assignee = { employeeId: "employee-1", note: null };

  const decided = startReadySteps(
    steps,
    progress,
    (step) => {
      expect(step.kind).toBe("task");
      return assignee;
    },
    now,
  );

  expect(decided.completedActions).toEqual([action]);
  expect(decided.starts).toEqual([{ step: check, assignee }]);
  expect(decided.progress).toEqual([
    progress[0],
    { ...progress[1], status: "step_completed", finishedAt: now },
    { ...progress[2], status: "step_awaiting_task_completion" },
  ]);
});

test("returns chained actions in completion order even when displayed in reverse", () => {
  const first = actionStep("first");
  const second = actionStep("second", [{ step: "first", when: null }]);

  const decided = startReadySteps(
    [second, first],
    [row("second"), row("first")],
    () => {
      throw new Error("Actions have no assignee");
    },
    now,
  );

  expect(decided.completedActions).toEqual([first, second]);
  expect(decided.starts).toEqual([]);
  expect(decided.progress).toEqual([
    { ...row("second"), status: "step_completed", finishedAt: now },
    { ...row("first"), status: "step_completed", finishedAt: now },
  ]);
});

test("does not reach or return an action behind an unmet result condition", () => {
  const action = actionStep("tell_owner", [{ step: "answer", when: { result: "no" } }]);
  const progress: RunStep[] = [
    {
      ...row("answer"),
      status: "step_completed",
      result: { code: "yes", comment: null },
      finishedAt: now,
    },
    row("tell_owner"),
  ];

  const decided = startReadySteps([taskStep("answer"), action], progress, () => null, now);

  expect(decided.completedActions).toEqual([]);
  expect(decided.starts).toEqual([]);
  expect(decided.progress).toEqual([
    progress[0],
    { ...progress[1], status: "step_not_reached", finishedAt: now },
  ]);
});

function actionStep(key: string, after: ActionStep["after"] = []): ActionStep {
  return {
    key,
    kind: "action",
    after,
    join: "all",
    action: { name: "test.record_call", params: { note: key } },
  };
}

function taskStep(key: string, after: TaskStep["after"] = []): TaskStep {
  return {
    key,
    kind: "task",
    after,
    join: "all",
    task: {
      assignee: { kind: "subject" },
      title: "Check accounts",
      description: null,
      due: { amount: 0, unit: "calendar_days" },
      resultForm: null,
    },
  };
}

function row(stepKey: string): RunStep {
  return {
    runId: "run-onboarding",
    stepKey,
    status: "step_waiting_to_start",
    taskId: null,
    assigneeNote: null,
    skipReason: null,
    finishedAt: null,
    result: null,
  };
}

const now = new Date("2026-11-15T12:00:00Z");
