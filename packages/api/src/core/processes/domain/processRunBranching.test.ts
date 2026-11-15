import { expect, test } from "vitest";

import type { TaskStep } from "./processDefinition";
import { decideWaitingSteps, startReadySteps, type RunStep } from "./processRun";

test("waiting steps are ready in definition order once all their listed steps are completed", () => {
  const after = [
    { step: "a", when: null },
    { step: "b", when: null },
  ];

  const decision = decideWaitingSteps(
    [taskStep("a"), taskStep("b"), taskStep("d", after), taskStep("c", after)],
    [
      step("c", "step_waiting_to_start"),
      step("d", "step_waiting_to_start"),
      step("b", "step_completed"),
      step("a", "step_completed"),
    ],
  );

  expect(decision).toEqual({ ready: ["d", "c"], notReached: [] });
});

test("a waiting step is not ready while one listed step still awaits its task", () => {
  const decision = decideWaitingSteps(
    [
      taskStep("c", [
        { step: "a", when: null },
        { step: "b", when: null },
      ]),
    ],
    [step("a", "step_completed"), step("b"), step("c", "step_waiting_to_start")],
  );

  expect(decision).toEqual({ ready: [], notReached: [] });
});

test("a skipped listed step counts as done when deciding what is ready", () => {
  const decision = decideWaitingSteps(
    [
      taskStep("c", [
        { step: "a", when: null },
        { step: "b", when: null },
      ]),
    ],
    [step("a", "step_completed"), step("b", "step_skipped"), step("c", "step_waiting_to_start")],
  );

  expect(decision).toEqual({ ready: ["c"], notReached: [] });
});

test.each(["step_awaiting_task_completion", "step_completed"] as const)(
  "does not start a step already marked %s",
  (status) => {
    const decision = decideWaitingSteps([taskStep("a")], [step("a", status)]);

    expect(decision).toEqual({ ready: [], notReached: [] });
  },
);

test.each([
  ["yes", { ready: ["follow_up"], notReached: [] }],
  ["no", { ready: [], notReached: ["follow_up"] }],
])("an all join branches on the completed source's %s code", (code, expected) => {
  const decision = decideWaitingSteps(
    [taskStep("follow_up", [{ step: "answer", when: { result: "yes" } }])],
    [
      { ...step("answer", "step_completed"), result: { code, comment: null } },
      step("follow_up", "step_waiting_to_start"),
    ],
  );

  expect(decision).toEqual(expected);
});

test("an all join is not reached when one entry is impossible and another is pending", () => {
  const decision = decideWaitingSteps(
    [
      taskStep("follow_up", [
        { step: "answer", when: { result: "yes" } },
        { step: "paperwork", when: null },
      ]),
    ],
    [
      { ...step("answer", "step_completed"), result: { code: "no", comment: null } },
      step("paperwork"),
      step("follow_up", "step_waiting_to_start"),
    ],
  );

  expect(decision).toEqual({ ready: [], notReached: ["follow_up"] });
});

test("a skipped answering step releases a plain follower but cannot meet a result dependency", () => {
  const decision = decideWaitingSteps(
    [
      taskStep("plain", [{ step: "answer", when: null }]),
      taskStep("conditional", [{ step: "answer", when: { result: "yes" } }]),
    ],
    [
      step("answer", "step_skipped"),
      step("plain", "step_waiting_to_start"),
      step("conditional", "step_waiting_to_start"),
    ],
  );

  expect(decision).toEqual({ ready: ["plain"], notReached: ["conditional"] });
});

test("an any join starts when one entry is met even if another is impossible", () => {
  const follower = {
    ...taskStep("follow_up", [
      { step: "answer", when: { result: "yes" } },
      { step: "paperwork", when: null },
    ]),
    join: "any" as const,
  };

  const decision = decideWaitingSteps(
    [follower],
    [
      { ...step("answer", "step_completed"), result: { code: "no", comment: null } },
      step("paperwork", "step_skipped"),
      step("follow_up", "step_waiting_to_start"),
    ],
  );

  expect(decision).toEqual({ ready: ["follow_up"], notReached: [] });
});

test.each([
  ["step_waiting_to_start", []],
  ["step_not_reached", ["follow_up"]],
] as const)(
  "an any join with an impossible entry and a %s entry settles only when both are impossible",
  (status, notReached) => {
    const follower = {
      ...taskStep("follow_up", [
        { step: "answer", when: { result: "yes" } },
        { step: "paperwork", when: null },
      ]),
      join: "any" as const,
    };

    const decision = decideWaitingSteps(
      [follower],
      [
        step("answer", "step_skipped"),
        step("paperwork", status),
        step("follow_up", "step_waiting_to_start"),
      ],
    );

    expect(decision).toEqual({ ready: [], notReached });
  },
);

test("an any join with no dependencies starts with the run", () => {
  const decision = decideWaitingSteps(
    [{ ...taskStep("root"), join: "any" }],
    [step("root", "step_waiting_to_start")],
  );

  expect(decision).toEqual({ ready: ["root"], notReached: [] });
});

test("not reached cascades through reverse display order even when nothing can start", () => {
  const task: TaskStep["task"] = {
    assignee: { kind: "subject" },
    title: "Follow up",
    description: null,
    due: { amount: 0, unit: "calendar_days" },
    resultForm: null,
  };
  const steps: TaskStep[] = [
    taskStep("last", [{ step: "middle", when: null }]),
    taskStep("middle", [{ step: "answer", when: { result: "no" } }]),
    taskStep("answer"),
  ].map((step) => ({ ...step, kind: "task", task }));
  const answer = { ...step("answer", "step_completed"), result: { code: "yes", comment: null } };
  const progress: RunStep[] = [
    step("last", "step_waiting_to_start"),
    step("middle", "step_waiting_to_start"),
    answer,
  ].map((row) => ({
    runId: "run-onboarding",
    taskId: null,
    assigneeNote: null,
    skipReason: null,
    finishedAt: row.status === "step_completed" ? new Date("2026-11-08T12:00:00Z") : null,
    ...row,
  }));
  const now = new Date("2026-11-09T12:00:00Z");

  const decided = startReadySteps(steps, progress, () => null, now);

  expect(decided.starts).toEqual([]);
  expect(decided.progress).toEqual([
    { ...progress[0], status: "step_not_reached", finishedAt: now },
    { ...progress[1], status: "step_not_reached", finishedAt: now },
    progress[2],
  ]);
});

function taskStep(
  key: string,
  after: TaskStep["after"] = [],
): Pick<TaskStep, "key" | "after" | "join"> {
  return { key, after, join: "all" };
}

function step(
  stepKey: string,
  status: RunStep["status"] = "step_awaiting_task_completion",
): Pick<RunStep, "stepKey" | "status" | "result"> {
  return { stepKey, status, result: null };
}
