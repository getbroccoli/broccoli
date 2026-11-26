import { z } from "zod";

import { TASK_RESULT_FORM_SCHEMA } from "../../tasks";
import type { AfterEntry, AssigneeRule } from "./processDefinition";

/** How many of the steps a step waits for must let it start: every one, or any one. */
export const STEP_JOINS = ["all", "any"] as const;

const offsetSchema = z.object({
  amount: z.number().int(),
  unit: z.enum(["calendar_days", "business_days"]),
});

const assigneeRuleSchema: z.ZodType<AssigneeRule> = z.lazy(() =>
  z.object({
    kind: z.enum(["subject", "subjects_manager", "workspace_owner"]),
    otherwise: assigneeRuleSchema.optional(),
  }),
);

const whenFieldSchema = z.string().trim().min(1);
const whenValuesSchema = z.array(z.string().nullable()).min(1);

const triggerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("on_record_date"),
    recordType: z.string().min(1),
    dateField: z.string().min(1),
    offset: offsetSchema,
    maxDaysLate: z.number().int().min(0),
  }),
  z.discriminatedUnion("run", [
    eventTriggerSchema({
      run: z.literal("in_same_transaction"),
      faultMode: z.literal("rollback_transaction"),
    }),
    // A fault mode is refused rather than dropped: retrying is how an after-commit run handles faults.
    eventTriggerSchema({ run: z.literal("after_commit"), faultMode: z.never().optional() }),
  ]),
]);

function eventTriggerSchema<Shape extends z.ZodRawShape>(runShape: Shape) {
  return z.object({
    kind: z.literal("on_event"),
    event: z.string().min(1),
    when: z
      .union([
        z.object({ field: whenFieldSchema, in: whenValuesSchema }).strict(),
        z.object({ field: whenFieldSchema, notIn: whenValuesSchema }).strict(),
      ])
      .optional(),
    ...runShape,
  });
}

const stepKeySchema = z.string().trim().min(1);

const afterEntrySchema = z.union([
  stepKeySchema.transform((step): AfterEntry => ({ step, when: null })),
  z.object({
    step: stepKeySchema,
    when: z
      .object({ result: z.string().min(1) })
      .nullable()
      .default(null),
  }),
]);

const stepBaseSchema = z.object({
  key: stepKeySchema,
  after: z.array(afterEntrySchema).default([]),
  join: z.enum(STEP_JOINS).default("all"),
});

const stepSchema = z.discriminatedUnion("kind", [
  stepBaseSchema.extend({
    kind: z.literal("task"),
    task: z.object({
      assignee: assigneeRuleSchema,
      title: z.string().trim().min(1),
      description: z.string().nullable().default(null),
      due: offsetSchema,
      resultForm: TASK_RESULT_FORM_SCHEMA.nullable().default(null),
      askedBy: z
        .object({ kind: z.literal("event_employee"), field: z.string().trim().min(1) })
        .nullable()
        .default(null),
    }),
  }),
  stepBaseSchema.extend({
    kind: z.literal("action"),
    action: z.object({ name: z.string().min(1), params: z.unknown().default({}) }),
  }),
]);

/** A stored definition's shape, filling what may be left out. */
export const definitionSchema = z.object({
  subject: z.object({ recordType: z.string().min(1) }),
  trigger: triggerSchema,
  steps: z.array(stepSchema).min(1),
  outcome: z
    .object({ step: stepKeySchema, labels: z.record(z.string(), z.string().min(1)).default({}) })
    .nullable()
    .default(null),
});
