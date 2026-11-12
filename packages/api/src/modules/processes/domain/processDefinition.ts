import { z } from "zod";

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

/** What one version of a process does; its steps run in parallel, listed in display order. */
export interface ProcessDefinition {
  subject: { recordType: "employee" };
  trigger: RecordDateTrigger;
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
  refuseEventTrigger(definition);
  const parsed: ProcessDefinition = definitionSchema.parse(definition);
  refuseRepeatedStepKeys(parsed.steps);
  for (const offset of [parsed.trigger.offset, ...parsed.steps.map(({ due }) => due)]) {
    refuseOffsetBeyondLimit(offset);
  }
  return parsed;
}

const EVENT_TRIGGER_KINDS = new Set(["on_record_created", "on_record_changed", "on_schedule"]);

function refuseEventTrigger(definition: unknown): void {
  const kind = (definition as { trigger?: { kind?: unknown } } | null)?.trigger?.kind;
  if (typeof kind === "string" && EVENT_TRIGGER_KINDS.has(kind)) {
    throw new Error(`Trigger kind ${kind} needs durable record events, which are not built yet.`);
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

const definitionSchema = z.object({
  subject: z.object({ recordType: z.literal("employee") }),
  trigger: z.object({
    kind: z.literal("on_record_date"),
    recordType: z.literal("employee"),
    dateField: z.literal("startDate"),
    offset: offsetSchema,
    maxDaysLate: z.number().int().min(0),
  }),
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
