import { expect, test } from "vitest";

import { parseProcessDefinition, PROCESS_DEFINITION_SCHEMA_VERSION } from "./processDefinition";

test("reads a welcome definition with its trigger, fallback and parallel steps", () => {
  const definition = welcomeDefinition();

  const parsed = parseProcessDefinition(PROCESS_DEFINITION_SCHEMA_VERSION, definition, catalog);

  expect(parsed).toEqual(definition);
});

test("a step without after waits for no steps", () => {
  const definition = welcomeDefinition();
  const { key, kind, task } = definition.steps[0]!;

  const parsed = parseProcessDefinition(
    1,
    { ...definition, steps: [{ key, kind, task }] },
    catalog,
  );

  expect(parsed.steps[0]!.after).toEqual([]);
});

test("refuses a step that waits for an unknown step", () => {
  const definition = welcomeDefinition();
  definition.steps[0]!.key = "ensure_provision";
  definition.steps[0]!.after = ["laptop"];

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "Step ensure_provision waits for laptop, which is not a step.",
  );
});

test("refuses a step that waits for itself", () => {
  const definition = welcomeDefinition();
  definition.steps[0]!.key = "a";
  definition.steps[0]!.after = ["a"];

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow("Step a waits for itself.");
});

test("refuses a step that lists another step twice", () => {
  const definition = welcomeDefinition();
  definition.steps[0]!.key = "a";
  definition.steps[1]!.key = "c";
  definition.steps[1]!.after = ["a", "a"];

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow("Step c lists a twice.");
});

test("reports only the steps on a cycle in definition order", () => {
  const definition = welcomeDefinition();
  const step = definition.steps[0]!;
  definition.steps = [
    { ...step, key: "c", after: ["b"] },
    { ...step, key: "a", after: ["b"] },
    { ...step, key: "b", after: ["a"] },
  ];

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "Steps a, b wait for each other.",
  );
});

test("refuses an unknown definition schema version", () => {
  expect(() => parseProcessDefinition(2, welcomeDefinition(), catalog)).toThrow(
    "Process definition schema version 2 is not known.",
  );
});

test("refuses an unbuilt record-created trigger", () => {
  const definition = welcomeDefinition();
  definition.trigger.kind = "on_record_created";

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "Trigger kind on_record_created is not built.",
  );
});

test("refuses an unbuilt record-changed trigger", () => {
  const definition = welcomeDefinition();
  definition.trigger.kind = "on_record_changed";

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "Trigger kind on_record_changed is not built.",
  );
});

test("refuses a schedule trigger until it is supported", () => {
  const definition = welcomeDefinition();
  definition.trigger.kind = "on_schedule";

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "Trigger kind on_schedule is not built.",
  );
});

test("refuses duplicate step keys", () => {
  const definition = welcomeDefinition();
  definition.steps[0]!.key = "coffee_calls";

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "Step key coffee_calls is used twice.",
  );
});

test("refuses a trigger more than 366 calendar days after its date", () => {
  const definition = welcomeDefinition();
  definition.trigger.offset.amount = 400;

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "An offset of 400 calendar_days is beyond the limit of 366.",
  );
});

test("refuses a task due more than 366 calendar days before the start", () => {
  const definition = welcomeDefinition();
  definition.steps[0]!.task.due.amount = -367;

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "An offset of -367 calendar_days is beyond the limit of 366.",
  );
});

test("refuses a trigger more than 260 business days before its date", () => {
  const definition = welcomeDefinition();
  definition.trigger.offset = { amount: -261, unit: "business_days" };

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "An offset of -261 business_days is beyond the limit of 260.",
  );
});

test("refuses a task due more than 260 business days after the start", () => {
  const definition = welcomeDefinition();
  definition.steps[1]!.task.due.amount = 261;

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "An offset of 261 business_days is beyond the limit of 260.",
  );
});

test("accepts offsets at the calendar and business day limits", () => {
  const definition = welcomeDefinition();
  definition.trigger.offset.amount = -366;
  definition.steps[0]!.task.due.amount = 366;
  definition.steps[1]!.task.due.amount = 260;

  expect(parseProcessDefinition(1, definition, catalog)).toEqual(definition);
});

test("refuses an unknown assignee kind", () => {
  const definition = welcomeDefinition();
  definition.steps[0]!.task.assignee.kind = "department";

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow();
});

test("refuses an unregistered subject record type", () => {
  const definition = welcomeDefinition();
  definition.subject.recordType = "leave_request";

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "Record type leave_request cannot be the subject of a process.",
  );
});

test("refuses a date field not registered for the record type", () => {
  const definition = welcomeDefinition();
  definition.trigger.dateField = "endDate";

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "Record type employee has no date field endDate.",
  );
});

test.each([
  ["employees.added", "employee"],
  ["tasks.task_created", "task"],
  ["tasks.task_status_changed", "task"],
])("accepts %s as an event trigger for %s records", (event, recordType) => {
  const definition = eventDefinition(event, recordType);

  expect(parseProcessDefinition(1, definition, catalog)).toEqual(definition);
});

test("refuses an event that cannot trigger a process", () => {
  expect(() => parseProcessDefinition(1, eventDefinition("example.happened"), catalog)).toThrow(
    "Event example.happened cannot trigger a process.",
  );
});

test("refuses an event condition without any accepted values", () => {
  const definition = eventDefinition("tasks.task_status_changed", "task");
  const trigger = { ...definition.trigger, when: { field: "to", in: [] } };

  expect(() => parseProcessDefinition(1, { ...definition, trigger }, catalog)).toThrow();
});

test("accepts an after-commit trigger without a fault mode", () => {
  const definition = eventDefinition("employees.added");
  const trigger = { kind: "on_event", event: "employees.added", run: "after_commit" };

  expect(parseProcessDefinition(1, { ...definition, trigger }, catalog)).toEqual({
    ...definition,
    trigger,
  });
});

test("refuses an after-commit trigger with a fault mode", () => {
  const definition = eventDefinition("employees.added");
  definition.trigger.run = "after_commit";

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow();
});

test("refuses an in-same-transaction trigger without a fault mode", () => {
  const definition = eventDefinition("employees.added");
  const trigger = { kind: "on_event", event: "employees.added", run: "in_same_transaction" };

  expect(() => parseProcessDefinition(1, { ...definition, trigger }, catalog)).toThrow();
});

test("refuses an event trigger that silently ignores failures", () => {
  const definition = eventDefinition("employees.added");
  definition.trigger.faultMode = "silent";

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow();
});

test("refuses an event trigger without a run mode", () => {
  const definition = eventDefinition("employees.added");
  const { kind, event, faultMode } = definition.trigger;

  expect(() =>
    parseProcessDefinition(
      1,
      {
        ...definition,
        trigger: { kind, event, faultMode },
      },
      catalog,
    ),
  ).toThrow();
});

test("refuses a subject differing from the triggering event's record type", () => {
  const definition = eventDefinition("tasks.task_created", "employee");

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "The subject employee differs from the record type task of event tasks.task_created.",
  );
});

function eventDefinition(event: string, recordType = "employee") {
  return {
    ...welcomeDefinition(),
    subject: { recordType },
    trigger: {
      kind: "on_event",
      event,
      run: "in_same_transaction",
      faultMode: "rollback_transaction",
    },
  };
}

function welcomeDefinition() {
  return {
    subject: { recordType: "employee" },
    trigger: {
      kind: "on_record_date",
      recordType: "employee",
      dateField: "startDate",
      offset: { amount: 0, unit: "calendar_days" },
      maxDaysLate: 7,
    },
    steps: [
      {
        key: "welcome_one_to_one",
        kind: "task",
        after: [] as string[],
        task: {
          assignee: { kind: "subjects_manager", otherwise: { kind: "workspace_owner" } },
          title: "Have a welcome 1:1 with {firstName}",
          description: "Welcome the new person.",
          due: { amount: 0, unit: "calendar_days" },
        },
      },
      {
        key: "coffee_calls",
        kind: "task",
        after: [] as string[],
        task: {
          assignee: { kind: "subject" },
          title: "Have coffee calls with 3 colleagues",
          description: "Meet the team.",
          due: { amount: 5, unit: "business_days" },
        },
      },
    ],
  };
}

const catalog = {
  recordTypes: { employee: { dateFields: ["startDate"] }, task: { dateFields: [] } },
  triggeringEvents: {
    "employees.added": { recordType: "employee" },
    "tasks.task_created": { recordType: "task" },
    "tasks.task_status_changed": { recordType: "task" },
  },
};
