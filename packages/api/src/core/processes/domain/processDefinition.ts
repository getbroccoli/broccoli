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
  recordType: string;
  /** One of the date fields its record type registered, such as an employee's `startDate`. */
  dateField: string;
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
  /** An event a module registered as triggering. */
  event: string;
  /** Only events whose payload field holds one of these values. */
  when?: { field: string; in: (string | null)[] };
  run: "in_same_transaction";
  faultMode: "rollback_transaction";
}

/** What one version of a process does; its steps run in parallel, listed in display order. */
export interface ProcessDefinition {
  /** The record a run is about, the trigger's record type. */
  subject: { recordType: string };
  trigger: RecordDateTrigger | EventTrigger;
  startableByAdmin: boolean;
  steps: TaskStep[];
}

/** What the modules registered that a definition may name. */
export interface ProcessCatalog {
  /** Record types a run may be about, with the date fields an `on_record_date` trigger may name. */
  recordTypes: Readonly<Record<string, { dateFields: readonly string[] }>>;
  /** Events that may start a run, with the record type each is about. */
  triggeringEvents: Readonly<Record<string, { recordType: string }>>;
}

/** Reads a stored definition, refusing a shape, trigger, record type or step this code cannot run. */
export function parseProcessDefinition(
  schemaVersion: number,
  definition: unknown,
  catalog: ProcessCatalog,
): ProcessDefinition {
  if (schemaVersion !== PROCESS_DEFINITION_SCHEMA_VERSION) {
    throw new Error(`Process definition schema version ${schemaVersion} is not known.`);
  }
  refuseUnbuiltTrigger(definition, catalog);
  const parsed: ProcessDefinition = definitionSchema.parse(definition);
  refuseUnregisteredRecord(parsed, catalog);
  refuseSubjectOtherThanTrigger(parsed, catalog);
  refuseRepeatedStepKeys(parsed.steps);
  const triggerOffsets = parsed.trigger.kind === "on_record_date" ? [parsed.trigger.offset] : [];
  for (const offset of [...triggerOffsets, ...parsed.steps.map(({ due }) => due)]) {
    refuseOffsetBeyondLimit(offset);
  }
  return parsed;
}

const UNBUILT_TRIGGER_KINDS = new Set(["on_record_created", "on_record_changed", "on_schedule"]);

function refuseUnbuiltTrigger(definition: unknown, { triggeringEvents }: ProcessCatalog): void {
  const trigger = (definition as { trigger?: { kind?: unknown; event?: unknown } } | null)?.trigger;
  if (typeof trigger?.kind === "string" && UNBUILT_TRIGGER_KINDS.has(trigger.kind)) {
    throw new Error(`Trigger kind ${trigger.kind} is not built.`);
  }
  if (trigger?.kind === "on_event" && !Object.hasOwn(triggeringEvents, String(trigger.event))) {
    throw new Error(`Event ${String(trigger.event)} cannot trigger a process.`);
  }
}

function refuseUnregisteredRecord(
  { subject, trigger }: ProcessDefinition,
  { recordTypes }: ProcessCatalog,
): void {
  if (!Object.hasOwn(recordTypes, subject.recordType)) {
    throw new Error(`Record type ${subject.recordType} cannot be the subject of a process.`);
  }
  if (
    trigger.kind === "on_record_date" &&
    !recordTypes[trigger.recordType]?.dateFields.includes(trigger.dateField)
  ) {
    throw new Error(`Record type ${trigger.recordType} has no date field ${trigger.dateField}.`);
  }
}

function refuseSubjectOtherThanTrigger(
  { subject, trigger }: ProcessDefinition,
  { triggeringEvents }: ProcessCatalog,
): void {
  const [recordType, source] =
    trigger.kind === "on_event"
      ? [triggeringEvents[trigger.event]!.recordType, `event ${trigger.event}`]
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
    recordType: z.string().min(1),
    dateField: z.string().min(1),
    offset: offsetSchema,
    maxDaysLate: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("on_event"),
    event: z.string().min(1),
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
  subject: z.object({ recordType: z.string().min(1) }),
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
