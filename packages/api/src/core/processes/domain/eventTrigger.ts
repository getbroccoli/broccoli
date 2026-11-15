import type { ProcessDefinition } from "./processDefinition";

/**
 * What an event that may start a process means to processes, registered by the module that
 * publishes it: the record type it is about, the ids of those records in its payload (one run per
 * record), and the payload a run keeps for its own record.
 */
export interface TriggeringEventRegistration {
  recordType: string;
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

/** The `on_event` trigger as a definition stores it. */
export interface EventTriggerFields {
  kind: "on_event";
  /** An event a module registered as triggering. */
  event: string;
  /** Only events whose payload field holds one of these values. */
  when?: { field: string; in: (string | null)[] };
  run: "in_same_transaction";
  faultMode: "rollback_transaction";
}

/**
 * Starts a run for each record an event is about, inside the transaction that published it: the
 * run commits with the change, and a run that fails fails the change.
 */
export class EventTrigger implements Readonly<EventTriggerFields> {
  declare readonly kind: "on_event";
  declare readonly event: string;
  declare readonly when?: { field: string; in: (string | null)[] };
  declare readonly run: "in_same_transaction";
  declare readonly faultMode: "rollback_transaction";

  private constructor(fields: EventTriggerFields) {
    Object.assign(this, fields);
  }

  /** The trigger as its definition stores it. */
  static restore(fields: EventTriggerFields): EventTrigger {
    return new EventTrigger(fields);
  }

  /** Whether the event is this trigger's, with its `when` field holding one of the values. */
  isTriggeredBy({ type, payload }: TriggerEvent): boolean {
    if (type !== this.event) return false;
    if (!this.when) return true;
    const value = (payload as Record<string, unknown>)[this.when.field] ?? null;
    return this.when.in.some((expected) => expected === value);
  }
}

/** One run to start: a process, the event that triggered it and one record the event is about. */
export interface EventStart<Event extends TriggerEvent = TriggerEvent> {
  processId: string;
  event: Event;
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
      trigger.kind === "on_event" && trigger.isTriggeredBy(event)
        ? (triggeringEvents[event.type]?.recordIds(event.payload) ?? []).map((recordId) => ({
            processId,
            event,
            recordId,
          }))
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
