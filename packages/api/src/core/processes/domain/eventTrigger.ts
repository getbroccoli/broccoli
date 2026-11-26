import { type EventTrigger, FROM_EVENT, type ProcessDefinition } from "./processDefinition";

/**
 * What an event that may start a process means to processes, registered by the module that
 * publishes it: the record type it is about, the ids of those records in its payload (one run per
 * record), and the payload a run keeps for its own record.
 */
export interface TriggeringEventRegistration {
  /** The record type of its records, or `from_event` when `recordTypeOf` reads it from each payload. */
  recordType: string;
  recordTypeOf?(payload: unknown): string;
  recordIds(payload: unknown): readonly string[];
  payloadFor(payload: unknown, recordId: string): unknown;
}

/** The events that may start a process, by type. */
export type TriggeringEvents = Readonly<Record<string, TriggeringEventRegistration>>;

/** An event as a trigger reads it. */
export interface TriggerEvent {
  id: string;
  type: string;
  payload: unknown;
}

/** One run to start: a process, the event that triggered it and one record the event is about. */
export interface EventStart<Event extends TriggerEvent = TriggerEvent> {
  processId: string;
  event: Event;
  recordType: string;
  recordId: string;
}

/**
 * The runs the events start, one per matching process and record, in the order of the events,
 * then the processes, then the event's records.
 */
export function matchEventStarts<Event extends TriggerEvent>(
  processes: readonly { processId: string; trigger: ProcessDefinition["trigger"] }[],
  events: readonly Event[],
  triggeringEvents: TriggeringEvents,
): EventStart<Event>[] {
  return events.flatMap((event) =>
    processes.flatMap(({ processId, trigger }) =>
      trigger.kind === "on_event" && isTriggeredBy(trigger, event)
        ? startsOf(processId, event, triggeringEvents[event.type])
        : [],
    ),
  );
}

/** The event as it concerns one of its records, as that record's run keeps it. */
export function eventAboutRecord(
  { id, type, payload }: TriggerEvent,
  recordId: string,
  triggeringEvents: TriggeringEvents,
): TriggerEvent {
  return { id, type, payload: triggeringEvents[type]!.payloadFor(payload, recordId) };
}

function isTriggeredBy(trigger: EventTrigger, { type, payload }: TriggerEvent): boolean {
  if (type !== trigger.event) return false;
  if (!trigger.when) return true;
  const { when } = trigger;
  const value = (payload as Record<string, unknown>)[when.field] ?? null;
  return "in" in when
    ? when.in.includes(value as string | null)
    : !when.notIn.includes(value as string | null);
}

function startsOf<Event extends TriggerEvent>(
  processId: string,
  event: Event,
  registration: TriggeringEventRegistration | undefined,
): EventStart<Event>[] {
  if (!registration) return [];
  const recordType =
    registration.recordType === FROM_EVENT
      ? registration.recordTypeOf!(event.payload)
      : registration.recordType;
  return registration
    .recordIds(event.payload)
    .map((recordId) => ({ processId, event, recordType, recordId }));
}
