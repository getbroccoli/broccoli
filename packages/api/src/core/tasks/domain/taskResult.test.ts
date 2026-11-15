import { expect, test } from "vitest";
import { ZodError } from "zod";

import { TASK_RESULT_FORM_SCHEMA } from "./taskResult";

test("fills form defaults and trims option labels", () => {
  const form = TASK_RESULT_FORM_SCHEMA.parse({
    kind: "choice",
    options: [
      { code: "yes", label: " Yes " },
      { code: "no", label: "No", commentRequired: true },
    ],
  });

  expect(form).toEqual({
    kind: "choice",
    display: "buttons",
    options: [
      { code: "yes", label: "Yes", commentRequired: false },
      { code: "no", label: "No", commentRequired: true },
    ],
  });
});

test.each([
  { name: "an unsupported kind", form: { kind: "text" } },
  { name: "one option", form: { options: [{ code: "yes", label: "Yes" }] } },
  {
    name: "four buttons",
    form: {
      display: "buttons",
      options: [
        { code: "a", label: "A" },
        { code: "b", label: "B" },
        { code: "c", label: "C" },
        { code: "d", label: "D" },
      ],
    },
  },
  {
    name: "duplicate codes",
    form: {
      options: [
        { code: "yes", label: "Yes" },
        { code: "yes", label: "No" },
      ],
    },
  },
  {
    name: "a code outside lowercase snake case",
    form: {
      options: [
        { code: "Not-Ready", label: "Not ready" },
        { code: "yes", label: "Yes" },
      ],
    },
  },
  {
    name: "a blank label",
    form: {
      options: [
        { code: "yes", label: " \t " },
        { code: "no", label: "No" },
      ],
    },
  },
])("refuses $name", ({ form }) => {
  expect(() =>
    TASK_RESULT_FORM_SCHEMA.parse({
      kind: "choice",
      options: [
        { code: "yes", label: "Yes" },
        { code: "no", label: "No" },
      ],
      ...form,
    }),
  ).toThrow(ZodError);
});

test("accepts four options displayed as choices", () => {
  const options = [
    { code: "ready", label: "Ready", commentRequired: false },
    { code: "not_ready", label: "Not ready", commentRequired: true },
    { code: "later", label: "Later", commentRequired: false },
    { code: "other", label: "Other", commentRequired: true },
  ];

  expect(TASK_RESULT_FORM_SCHEMA.parse({ kind: "choice", display: "choices", options })).toEqual({
    kind: "choice",
    display: "choices",
    options,
  });
});
