import type { DomainEvents } from "../../../core/events";
import type { EventTrigger, ProcessDefinition } from "./processDefinition";

/**
 * The events that may start a process, with the record type each is about, the ids of those
 * records in its payload (one run per record), and the payload a run keeps for its own record.
 */
// shortcut: the list lives here; move it to the publishing modules' registrations when modules become dynamic.
export const TRIGGERING_EVENTS = {
  "employees.added": {
    recordType: "employee",
    recordIds: ({ employeeIds }: DomainEvents["employees.added"]) => employeeIds,
    payloadFor: (_: DomainEvents["employees.added"], employeeId: string) => ({
      employeeIds: [employeeId],
    }),
  },
  "tasks.task_created": {
    recordType: "task",
    recordIds: ({ taskId }: DomainEvents["tasks.task_created"]) => [taskId],
    payloadFor: (payload: DomainEvents["tasks.task_created"]) => payload,
  },
  "tasks.task_status_changed": {
    recordType: "task",
    recordIds: ({ taskId }: DomainEvents["tasks.task_status_changed"]) => [taskId],
    payloadFor: (payload: DomainEvents["tasks.task_status_changed"]) => payload,
  },
} as const;

export type TriggeringEventType = keyof typeof TRIGGERING_EVENTS;

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
  recordId: string;
}

/**
 * The runs the events start, one per matching process and record, in the order of the events,
 * then the processes, then the event's records.
 */
export function matchEventStarts<Event extends TriggerEvent>(
  processes: readonly { processId: string; trigger: ProcessDefinition["trigger"] }[],
  events: readonly Event[],
): EventStart<Event>[] {
  return events.flatMap((event) =>
    processes.flatMap(({ processId, trigger }) =>
      trigger.kind === "on_event" && isTriggeredBy(trigger, event)
        ? recordIdsOf(event).map((recordId) => ({ processId, event, recordId }))
        : [],
    ),
  );
}

/** The event as it concerns one of its records, as that record's run keeps it. */
export function eventAboutRecord(
  { id, type, payload }: TriggerEvent,
  recordId: string,
): TriggerEvent {
  return { id, type, payload: entryOf(type).payloadFor(payload, recordId) };
}

export function isTriggeringEvent(type: string): type is TriggeringEventType {
  return Object.hasOwn(TRIGGERING_EVENTS, type);
}

function isTriggeredBy(trigger: EventTrigger, { type, payload }: TriggerEvent): boolean {
  if (type !== trigger.event) return false;
  if (!trigger.when) return true;
  const value = (payload as Record<string, unknown>)[trigger.when.field] ?? null;
  return trigger.when.in.some((expected) => expected === value);
}

function recordIdsOf({ type, payload }: TriggerEvent): readonly string[] {
  return isTriggeringEvent(type) ? entryOf(type).recordIds(payload) : [];
}

/** An event's entry, typed for any payload: each entry reads its own event's, which `type` names. */
function entryOf(type: string) {
  return TRIGGERING_EVENTS[type as TriggeringEventType] as {
    recordIds: (payload: unknown) => string[];
    payloadFor: (payload: unknown, recordId: string) => unknown;
  };
}
