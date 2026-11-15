import { expect, test } from "vitest";
import { z } from "zod";

import { parseProcessDefinition, type StoredProcessDefinition } from "./processDefinition";

test("reads an action step with its after, join and defaulted params", () => {
  const action = {
    key: "tell_owner",
    kind: "action" as const,
    after: ["prepare", { step: "answer", when: { result: "yes" } }],
    join: "any" as const,
    action: { name: "test.record_call", params: {} },
  };

  const parsed = parseProcessDefinition(1, withSteps(prepare, answer, action), catalog);

  expect(parsed.steps[2]).toEqual({
    ...action,
    after: [
      { step: "prepare", when: null },
      { step: "answer", when: { result: "yes" } },
    ],
    action: { name: "test.record_call", params: { note: "none" } },
  });
});

test.each(["wait", "subprocess", "agent", "end"])("refuses the unbuilt %s step kind", (kind) => {
  const definition = { ...withSteps(prepare), steps: [{ key: "later", kind }] };

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    `Step kind ${kind} is not built.`,
  );
});

test("refuses an action that is not registered", () => {
  const definition = withSteps({
    key: "tell_owner",
    kind: "action",
    action: { name: "test.unknown", params: {} },
  });

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "Action test.unknown is not registered.",
  );
});

test("refuses bad action params and names the step", () => {
  const definition = withSteps({
    key: "tell_owner",
    kind: "action",
    action: { name: "test.record_call", params: { note: 42 } },
  });

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    /^Step tell_owner has bad params for action test\.record_call:/,
  );
});

test("refuses a step waiting for an action step's result", () => {
  const definition = withSteps(
    { key: "tell_owner", kind: "action", action: { name: "test.record_call", params: {} } },
    { ...prepare, key: "check", after: [{ step: "tell_owner", when: { result: "yes" } }] },
  );

  expect(() => parseProcessDefinition(1, definition, catalog)).toThrow(
    "Step check waits for a result of tell_owner, which asks for none.",
  );
});

type StoredStep = StoredProcessDefinition["steps"][number];

function withSteps(...steps: StoredStep[]): StoredProcessDefinition {
  return {
    subject: { recordType: "employee" },
    trigger: {
      kind: "on_record_date",
      recordType: "employee",
      dateField: "startDate",
      offset: { amount: 0, unit: "calendar_days" },
      maxDaysLate: 7,
    },
    steps,
  };
}

const prepare = {
  key: "prepare",
  kind: "task",
  task: {
    assignee: { kind: "subject" },
    title: "Prepare accounts",
    due: { amount: 0, unit: "calendar_days" },
  },
} satisfies StoredStep;

const answer = {
  ...prepare,
  key: "answer",
  task: {
    ...prepare.task,
    resultForm: {
      kind: "choice",
      options: [
        { code: "yes", label: "Yes" },
        { code: "no", label: "No" },
      ],
    },
  },
} satisfies StoredStep;

const catalog = {
  recordTypes: { employee: { dateFields: ["startDate"] } },
  triggeringEvents: {},
  actions: { "test.record_call": { params: z.object({ note: z.string().default("none") }) } },
};
