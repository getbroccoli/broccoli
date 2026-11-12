import { z } from "zod";

import { isTriggeringEvent, TRIGGERING_EVENTS, type TriggeringEventType } from "./eventTrigger";

/** The shape of `process_versions.definition` this code reads; a migration moves older shapes on. */
export const PROCESS_DEFINITION_SCHEMA_VERSION = 1;

/** The ready-made process that welcomes a new starter on their start date. */
export const WELCOME_NEW_STARTER = "welcome_new_starter";

const OFFSET_LIMITS = { calendar_days: 366, business_days: 260 } as const;

/** Days before (negative) or after (positive) a date. */
export interface DayOffset {
  amount: number;
  unit: keyof typeof OFFSET_LIMITS;
}

/** Who will be a step task's assignee, and who covers when there is no one. */
export type AssigneeRule = {
  kind: "subject" | "subjects_manager" | "workspace_owner";
  otherwise?: AssigneeRule;
};

/** A step that gives one person a task; `title` and `description` may name `{firstName}`. */
export interface TaskStep {
  key: string;
  kind: "task";
  assignee: AssigneeRule;
  title: string;
  description: string | null;
  due: DayOffset;
}

/** Starts a run on a date of the subject record, plus an offset, by a daily pass. */
export interface RecordDateTrigger {
  kind: "on_record_date";
  recordType: "employee";
  dateField: "startDate";
  offset: DayOffset;
  /** How many days after that date a missed run still starts. */
  maxDaysLate: number;
}

/**
 * Starts a run for each record an event is about, inside the transaction that published it: the
 * run commits with the change, and a run that fails fails the change.
 */
export interface EventTrigger {
  kind: "on_event";
  event: TriggeringEventType;
  /** Only events whose payload field holds one of these values. */
  when?: { field: string; in: (string | null)[] };
  run: "in_same_transaction";
  faultMode: "rollback_transaction";
}

/** What one version of a process does; its steps run in parallel, listed in display order. */
export interface ProcessDefinition {
  /** The record a run is about, the trigger's record type. */
  subject: { recordType: "employee" | "task" };
  trigger: RecordDateTrigger | EventTrigger;
  startableByAdmin: boolean;
  steps: TaskStep[];
}

/** Reads a stored definition, refusing a shape, trigger or step this code cannot run. */
export function parseProcessDefinition(
  schemaVersion: number,
  definition: unknown,
): ProcessDefinition {
  if (schemaVersion !== PROCESS_DEFINITION_SCHEMA_VERSION) {
    throw new Error(`Process definition schema version ${schemaVersion} is not known.`);
  }
  refuseUnbuiltTrigger(definition);
  const parsed: ProcessDefinition = definitionSchema.parse(definition);
  refuseSubjectOtherThanTrigger(parsed);
  refuseRepeatedStepKeys(parsed.steps);
  const triggerOffsets = parsed.trigger.kind === "on_record_date" ? [parsed.trigger.offset] : [];
  for (const offset of [...triggerOffsets, ...parsed.steps.map(({ due }) => due)]) {
    refuseOffsetBeyondLimit(offset);
  }
  return parsed;
}

const UNBUILT_TRIGGER_KINDS = new Set(["on_record_created", "on_record_changed", "on_schedule"]);

function refuseUnbuiltTrigger(definition: unknown): void {
  const trigger = (definition as { trigger?: { kind?: unknown; event?: unknown } } | null)?.trigger;
  if (typeof trigger?.kind === "string" && UNBUILT_TRIGGER_KINDS.has(trigger.kind)) {
    throw new Error(`Trigger kind ${trigger.kind} is not built.`);
  }
  if (trigger?.kind === "on_event" && !isTriggeringEvent(String(trigger.event))) {
    throw new Error(`Event ${String(trigger.event)} cannot trigger a process.`);
  }
}

function refuseSubjectOtherThanTrigger({ subject, trigger }: ProcessDefinition): void {
  const [recordType, source] =
    trigger.kind === "on_event"
      ? [TRIGGERING_EVENTS[trigger.event].recordType, `event ${trigger.event}`]
      : [trigger.recordType, `trigger ${trigger.kind}`];
  if (subject.recordType !== recordType) {
    throw new Error(
      `The subject ${subject.recordType} differs from the record type ${recordType} of ${source}.`,
    );
  }
}

function refuseRepeatedStepKeys(steps: readonly TaskStep[]): void {
  const seen = new Set<string>();
  for (const { key } of steps) {
    if (seen.has(key)) throw new Error(`Step key ${key} is used twice.`);
    seen.add(key);
  }
}

function refuseOffsetBeyondLimit({ amount, unit }: DayOffset): void {
  if (Math.abs(amount) > OFFSET_LIMITS[unit]) {
    throw new Error(
      `An offset of ${amount} ${unit} is beyond the limit of ${OFFSET_LIMITS[unit]}.`,
    );
  }
}

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

const triggerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("on_record_date"),
    recordType: z.literal("employee"),
    dateField: z.literal("startDate"),
    offset: offsetSchema,
    maxDaysLate: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("on_event"),
    event: z.enum(Object.keys(TRIGGERING_EVENTS) as [TriggeringEventType]),
    when: z
      .object({
        field: z.string().trim().min(1),
        in: z.array(z.string().nullable()).min(1),
      })
      .optional(),
    run: z.literal("in_same_transaction"),
    faultMode: z.literal("rollback_transaction"),
  }),
]);

const definitionSchema = z.object({
  subject: z.object({ recordType: z.enum(["employee", "task"]) }),
  trigger: triggerSchema,
  startableByAdmin: z.boolean(),
  steps: z
    .array(
      z.object({
        key: z.string().trim().min(1),
        kind: z.literal("task"),
        assignee: assigneeRuleSchema,
        title: z.string().trim().min(1),
        description: z.string().nullable().default(null),
        due: offsetSchema,
      }),
    )
    .min(1),
});
