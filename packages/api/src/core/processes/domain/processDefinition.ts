import { z } from "zod";

import { TASK_RESULT_FORM_SCHEMA, type TaskResultForm } from "../../tasks";

/** The shape of `process_versions.definition` this code reads; a migration moves older shapes on. */
export const PROCESS_DEFINITION_SCHEMA_VERSION = 1;

/** The ready-made process that welcomes a new starter on their start date. */
export const WELCOME_NEW_STARTER = "welcome_new_starter";

/** The ready-made example of an onboarding whose last step waits for another. */
export const ONBOARDING_EXAMPLE = "onboarding_example";

/**
 * What one version of a process does; its steps are listed in display order, and those that wait
 * for nothing start with the run.
 */
export interface ProcessDefinition {
  /** The record a run is about, the trigger's record type. */
  subject: { recordType: string };
  trigger: RecordDateTrigger | EventTrigger;
  steps: TaskStep[];
}

/** What the modules registered that a definition may name. */
export interface ProcessCatalog {
  /** Record types a run may be about, with the date fields an `on_record_date` trigger may name. */
  recordTypes: Readonly<Record<string, { dateFields: readonly string[] }>>;
  /** Events that may start a run, with the record type each is about. */
  triggeringEvents: Readonly<Record<string, { recordType: string }>>;
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

/** Starts a run for each record an event is about. */
export type EventTrigger = {
  kind: "on_event";
  /** An event a module registered as triggering. */
  event: string;
  /** Only events whose payload field holds one of these values. */
  when?: { field: string; in: (string | null)[] };
} & (
  | /** Inside the transaction that published the event: a run that fails fails the change. */
    { run: "in_same_transaction"; faultMode: "rollback_transaction" }
    /** In a job queued with the change, after it commits: retried, never failing the change. */
  | { run: "after_commit" }
);

/** A step that gives one person a task. */
export interface TaskStep {
  key: string;
  kind: "task";
  /** The steps it waits for, all completed or skipped before it starts; none starts it with the run. */
  after?: string[];
  task: StepTask;
}

/** The task a task step gives; `title` and `description` may name `{firstName}`. */
export interface StepTask {
  assignee: AssigneeRule;
  title: string;
  description: string | null;
  due: DayOffset;
  /** What the task asks its assignee to give when they mark it done; copied onto the task. */
  resultForm: TaskResultForm | null;
}

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
  refuseUnrunnableWaits(parsed.steps);
  const triggerOffsets = parsed.trigger.kind === "on_record_date" ? [parsed.trigger.offset] : [];
  for (const offset of [...triggerOffsets, ...parsed.steps.map(({ task }) => task.due)]) {
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

/** Refuses a step waiting for a step that does not exist, for itself, twice, or in a cycle. */
function refuseUnrunnableWaits(steps: readonly TaskStep[]): void {
  const keys = new Set(steps.map(({ key }) => key));
  for (const { key, after = [] } of steps) {
    const listed = new Set<string>();
    for (const waitedFor of after) {
      if (waitedFor === key) throw new Error(`Step ${key} waits for itself.`);
      if (!keys.has(waitedFor)) {
        throw new Error(`Step ${key} waits for ${waitedFor}, which is not a step.`);
      }
      if (listed.has(waitedFor)) throw new Error(`Step ${key} lists ${waitedFor} twice.`);
      listed.add(waitedFor);
    }
  }
  const cycle = stepsOnCycle(steps);
  if (cycle.length > 0) throw new Error(`Steps ${cycle.join(", ")} wait for each other.`);
}

/** The steps that wait, directly or through others, for themselves, in definition order. */
function stepsOnCycle(steps: readonly TaskStep[]): string[] {
  const afterOf = new Map(steps.map(({ key, after = [] }) => [key, after]));
  return steps.flatMap(({ key }) => (waitedForBy(afterOf, key).has(key) ? [key] : []));
}

/** Every step `key` waits for, directly or through the steps it waits for. */
function waitedForBy(afterOf: ReadonlyMap<string, readonly string[]>, key: string): Set<string> {
  const reached = new Set<string>();
  const toVisit = [...(afterOf.get(key) ?? [])];
  while (toVisit.length > 0) {
    const next = toVisit.pop()!;
    if (reached.has(next)) continue;
    reached.add(next);
    toVisit.push(...(afterOf.get(next) ?? []));
  }
  return reached;
}

function refuseOffsetBeyondLimit({ amount, unit }: DayOffset): void {
  if (Math.abs(amount) > OFFSET_LIMITS[unit]) {
    throw new Error(
      `An offset of ${amount} ${unit} is beyond the limit of ${OFFSET_LIMITS[unit]}.`,
    );
  }
}

const OFFSET_LIMITS = { calendar_days: 366, business_days: 260 } as const;

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
      .object({
        field: z.string().trim().min(1),
        in: z.array(z.string().nullable()).min(1),
      })
      .optional(),
    ...runShape,
  });
}

const definitionSchema = z.object({
  subject: z.object({ recordType: z.string().min(1) }),
  trigger: triggerSchema,
  steps: z
    .array(
      z.object({
        key: z.string().trim().min(1),
        kind: z.literal("task"),
        after: z.array(z.string().trim().min(1)).default([]),
        task: z.object({
          assignee: assigneeRuleSchema,
          title: z.string().trim().min(1),
          description: z.string().nullable().default(null),
          due: offsetSchema,
          resultForm: TASK_RESULT_FORM_SCHEMA.nullable().default(null),
        }),
      }),
    )
    .min(1),
});
