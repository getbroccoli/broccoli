import { expect, test } from "vitest";

import { matchEventStarts } from "./eventTrigger";
import type { ProcessDefinition } from "./processDefinition";

test("starts each added person in event, process and record order", () => {
  const processes = [
    { processId: "welcome", trigger: onEvent("employees.added") },
    { processId: "induction", trigger: onEvent("employees.added") },
  ];
  const event = {
    id: "event-1",
    type: "employees.added",
    payload: { employeeIds: ["sam", "alex", "jo"] },
  };

  expect(matchEventStarts(processes, [event])).toEqual([
    { processId: "welcome", event, recordId: "sam" },
    { processId: "welcome", event, recordId: "alex" },
    { processId: "welcome", event, recordId: "jo" },
    { processId: "induction", event, recordId: "sam" },
    { processId: "induction", event, recordId: "alex" },
    { processId: "induction", event, recordId: "jo" },
  ]);
});

test.each(["tasks.task_created", "tasks.task_status_changed"] as const)(
  "starts one run for the task in %s",
  (type) => {
    const event = { id: "event-1", type, payload: { taskId: "task-1" } };

    expect(matchEventStarts([{ processId: "follow_up", trigger: onEvent(type) }], [event])).toEqual(
      [{ processId: "follow_up", event, recordId: "task-1" }],
    );
  },
);

test.each([
  { payload: { taskId: "task-1", to: "done" }, accepted: ["done", "cancelled"], matches: true },
  {
    payload: { taskId: "task-1", to: "cancelled" },
    accepted: ["done", "cancelled"],
    matches: true,
  },
  { payload: { taskId: "task-1", to: "waiting" }, accepted: ["done", "cancelled"], matches: false },
  { payload: { taskId: "task-1", to: null }, accepted: ["done"], matches: false },
  { payload: { taskId: "task-1" }, accepted: ["done"], matches: false },
  { payload: { taskId: "task-1", to: null }, accepted: [null], matches: true },
  { payload: { taskId: "task-1" }, accepted: [null], matches: true },
])("matches $payload against $accepted: $matches", ({ payload, accepted, matches }) => {
  const event = { id: "event-1", type: "tasks.task_status_changed", payload };
  const trigger = onEvent("tasks.task_status_changed", { field: "to", in: accepted });

  expect(matchEventStarts([{ processId: "follow_up", trigger }], [event])).toEqual(
    matches ? [{ processId: "follow_up", event, recordId: "task-1" }] : [],
  );
});

test("does not start a date-triggered process from an event", () => {
  const trigger: ProcessDefinition["trigger"] = {
    kind: "on_record_date",
    recordType: "employee",
    dateField: "startDate",
    offset: { amount: 0, unit: "calendar_days" },
    maxDaysLate: 7,
  };
  const event = { id: "event-1", type: "employees.added", payload: { employeeIds: ["sam"] } };

  expect(matchEventStarts([{ processId: "welcome", trigger }], [event])).toEqual([]);
});

test("keeps two matching events for the same record as separate starts", () => {
  const first = { id: "event-1", type: "employees.added", payload: { employeeIds: ["sam"] } };
  const second = { ...first, id: "event-2" };
  const processes = [
    { processId: "welcome", trigger: onEvent("employees.added") },
    { processId: "induction", trigger: onEvent("employees.added") },
  ];

  expect(matchEventStarts(processes, [first, second])).toEqual([
    { processId: "welcome", event: first, recordId: "sam" },
    { processId: "induction", event: first, recordId: "sam" },
    { processId: "welcome", event: second, recordId: "sam" },
    { processId: "induction", event: second, recordId: "sam" },
  ]);
});

test("does not start a process for an event of another type", () => {
  const event = { id: "event-1", type: "tasks.task_created", payload: { taskId: "task-1" } };

  expect(
    matchEventStarts([{ processId: "welcome", trigger: onEvent("employees.added") }], [event]),
  ).toEqual([]);
});

function onEvent(
  event: "employees.added" | "tasks.task_created" | "tasks.task_status_changed",
  when?: { field: string; in: (string | null)[] },
): ProcessDefinition["trigger"] {
  return {
    kind: "on_event",
    event,
    run: "in_same_transaction",
    faultMode: "rollback_transaction",
    ...(when && { when }),
  };
}
