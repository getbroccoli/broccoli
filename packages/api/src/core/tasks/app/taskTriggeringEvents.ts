import type { DomainEvents } from "../../events";

/**
 * Tasks' events that may start a process on the task, each run keeping the event as it came; the
 * composition gives them to processes.
 */
export const TASK_TRIGGERING_EVENTS = {
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
};
