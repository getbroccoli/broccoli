import type { DomainEvents } from "../../../core/events";
import type { EventTrigger, ProcessDefinition } from "./processDefinition";

/**
 * The events that may start a process, with the record type each is about and the ids of those
 * records in its payload: one run per record.
 */
// shortcut: the list lives here; move it to the publishing modules' registrations when modules become dynamic.
export const TRIGGERING_EVENTS = {
  "employees.added": {
    recordType: "employee",
    recordIds: ({ employeeIds }: DomainEvents["employees.added"]) => employeeIds,
  },
  "tasks.task_created": {
    recordType: "task",
    recordIds: ({ taskId }: DomainEvents["tasks.task_created"]) => [taskId],
  },
  "tasks.task_status_changed": {
    recordType: "task",
    recordIds: ({ taskId }: DomainEvents["tasks.task_status_changed"]) => [taskId],
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
  if (!isTriggeringEvent(type)) return [];
  // Each entry reads its own event's payload, which `type` names.
  const { recordIds } = TRIGGERING_EVENTS[type] as { recordIds: (payload: unknown) => string[] };
  return recordIds(payload);
}
