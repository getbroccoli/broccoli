import { expect, test } from "vitest";

import { parseProcessDefinition, PROCESS_DEFINITION_SCHEMA_VERSION } from "./processDefinition";

test("reads a welcome definition with its trigger, fallback and parallel steps", () => {
  const definition = welcomeDefinition();

  const parsed = parseProcessDefinition(PROCESS_DEFINITION_SCHEMA_VERSION, definition);

  expect(parsed).toEqual(definition);
});

test("refuses an unknown definition schema version", () => {
  expect(() => parseProcessDefinition(2, welcomeDefinition())).toThrow(
    "Process definition schema version 2 is not known.",
  );
});

test("refuses a record-created trigger until durable events exist", () => {
  const definition = welcomeDefinition();
  definition.trigger.kind = "on_record_created";

  expect(() => parseProcessDefinition(1, definition)).toThrow(
    "Trigger kind on_record_created needs durable record events, which are not built yet.",
  );
});

test("refuses a record-changed trigger until durable events exist", () => {
  const definition = welcomeDefinition();
  definition.trigger.kind = "on_record_changed";

  expect(() => parseProcessDefinition(1, definition)).toThrow(
    "Trigger kind on_record_changed needs durable record events, which are not built yet.",
  );
});

test("refuses a schedule trigger until it is supported", () => {
  const definition = welcomeDefinition();
  definition.trigger.kind = "on_schedule";

  expect(() => parseProcessDefinition(1, definition)).toThrow(
    "Trigger kind on_schedule needs durable record events, which are not built yet.",
  );
});

test("refuses duplicate step keys", () => {
  const definition = welcomeDefinition();
  definition.steps[0]!.key = "coffee_calls";

  expect(() => parseProcessDefinition(1, definition)).toThrow(
    "Step key coffee_calls is used twice.",
  );
});

test("refuses a trigger more than 366 calendar days after its date", () => {
  const definition = welcomeDefinition();
  definition.trigger.offset.amount = 400;

  expect(() => parseProcessDefinition(1, definition)).toThrow(
    "An offset of 400 calendar_days is beyond the limit of 366.",
  );
});

test("refuses a task due more than 366 calendar days before the start", () => {
  const definition = welcomeDefinition();
  definition.steps[0]!.due.amount = -367;

  expect(() => parseProcessDefinition(1, definition)).toThrow(
    "An offset of -367 calendar_days is beyond the limit of 366.",
  );
});

test("refuses a trigger more than 260 business days before its date", () => {
  const definition = welcomeDefinition();
  definition.trigger.offset = { amount: -261, unit: "business_days" };

  expect(() => parseProcessDefinition(1, definition)).toThrow(
    "An offset of -261 business_days is beyond the limit of 260.",
  );
});

test("refuses a task due more than 260 business days after the start", () => {
  const definition = welcomeDefinition();
  definition.steps[1]!.due.amount = 261;

  expect(() => parseProcessDefinition(1, definition)).toThrow(
    "An offset of 261 business_days is beyond the limit of 260.",
  );
});

test("accepts offsets at the calendar and business day limits", () => {
  const definition = welcomeDefinition();
  definition.trigger.offset.amount = -366;
  definition.steps[0]!.due.amount = 366;
  definition.steps[1]!.due.amount = 260;

  expect(parseProcessDefinition(1, definition)).toEqual(definition);
});

test("refuses an unknown assignee kind", () => {
  const definition = welcomeDefinition();
  definition.steps[0]!.assignee.kind = "department";

  expect(() => parseProcessDefinition(1, definition)).toThrow();
});

test("refuses a subject record other than an employee", () => {
  const definition = welcomeDefinition();
  definition.subject.recordType = "company";

  expect(() => parseProcessDefinition(1, definition)).toThrow();
});

test("refuses a trigger date other than the employee's start date", () => {
  const definition = welcomeDefinition();
  definition.trigger.dateField = "birthday";

  expect(() => parseProcessDefinition(1, definition)).toThrow();
});

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
    startableByAdmin: true,
    steps: [
      {
        key: "welcome_one_to_one",
        kind: "task",
        assignee: { kind: "subjects_manager", otherwise: { kind: "workspace_owner" } },
        title: "Have a welcome 1:1 with {firstName}",
        description: "Welcome the new person.",
        due: { amount: 0, unit: "calendar_days" },
      },
      {
        key: "coffee_calls",
        kind: "task",
        assignee: { kind: "subject" },
        title: "Have coffee calls with 3 colleagues",
        description: "Meet the team.",
        due: { amount: 5, unit: "business_days" },
      },
    ],
  };
}
