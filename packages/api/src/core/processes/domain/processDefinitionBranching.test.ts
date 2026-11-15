import { expect, test } from "vitest";

import { parseProcessDefinition, type StoredProcessDefinition } from "./processDefinition";

test("normalises mixed dependencies and defaults the join to all while keeping any", () => {
  const welcome = welcomeDefinition(choiceForm);
  const { task } = welcome.steps[1]!;
  const definition: StoredProcessDefinition = {
    ...welcome,
    steps: [
      ...welcome.steps,
      {
        key: "lunch",
        kind: "task",
        task,
        after: ["coffee_calls", { step: "welcome_one_to_one", when: { result: "yes" } }],
        join: "any",
      },
      { key: "follow_up", kind: "task", task, after: [{ step: "lunch" }] },
    ],
  };

  const parsed = parseProcessDefinition(1, definition, catalog);

  expect(parsed.steps.slice(2)).toMatchObject([
    {
      key: "lunch",
      after: [
        { step: "coffee_calls", when: null },
        { step: "welcome_one_to_one", when: { result: "yes" } },
      ],
      join: "any",
    },
    { key: "follow_up", after: [{ step: "lunch", when: null }], join: "all" },
  ]);
});

test("refuses a result dependency on a step that asks for none", () => {
  const definition = welcomeDefinition();
  definition.steps[1]!.after = [{ step: "welcome_one_to_one", when: { result: "yes" } }];

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "Step coffee_calls waits for a result of welcome_one_to_one, which asks for none.",
  );
});

test("refuses a result code that the earlier step does not offer", () => {
  const definition = welcomeDefinition(choiceForm);
  definition.steps[1]!.after = [{ step: "welcome_one_to_one", when: { result: "maybe" } }];

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "Step coffee_calls waits for result maybe of welcome_one_to_one, which does not offer it.",
  );
});

test("refuses a source listed as both a plain key and a result dependency", () => {
  const definition = welcomeDefinition(choiceForm);
  definition.steps[1]!.after = [
    "welcome_one_to_one",
    { step: "welcome_one_to_one", when: { result: "yes" } },
  ];

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "Step coffee_calls lists welcome_one_to_one twice.",
  );
});

test("refuses a cycle through a result dependency even with an any join", () => {
  const definition = welcomeDefinition(choiceForm);
  definition.steps[0]!.after = ["coffee_calls"];
  definition.steps[1]!.after = [{ step: "welcome_one_to_one", when: { result: "yes" } }];
  definition.steps[1]!.join = "any";

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "Steps welcome_one_to_one, coffee_calls wait for each other.",
  );
});

test("refuses an unknown join", () => {
  const definition = welcomeDefinition();
  const steps = [{ ...definition.steps[0]!, join: "majority" }];

  expect(() => parseProcessDefinition(1, { ...definition, steps }, catalog)).toThrow();
});

function welcomeDefinition(resultForm: unknown = null): StoredProcessDefinition {
  const task: StoredProcessDefinition["steps"][number]["task"] = {
    assignee: { kind: "subject" },
    title: "Welcome",
    due: { amount: 0, unit: "calendar_days" },
  };
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
        after: [],
        join: "all",
        task: { ...task, resultForm },
      },
      {
        key: "coffee_calls",
        kind: "task",
        after: [],
        join: "all",
        task: { ...task, resultForm: null },
      },
    ],
  };
}

const choiceForm = {
  kind: "choice",
  options: [
    { code: "yes", label: "Yes" },
    { code: "no", label: "No" },
  ],
};

const catalog = { recordTypes: { employee: { dateFields: ["startDate"] } }, triggeringEvents: {} };
