import { triggeringEvent, type TriggeringEvents } from "../domain";

/** Tasks' events that may start a process on the task, each run keeping the event as it came. */
export const TASK_TRIGGERING_EVENTS: TriggeringEvents = {
  "tasks.task_created": triggeringEvent<"tasks.task_created">({
    recordType: "task",
    recordIds: ({ taskId }) => [taskId],
    payloadFor: (payload) => payload,
  }),
  "tasks.task_status_changed": triggeringEvent<"tasks.task_status_changed">({
    recordType: "task",
    recordIds: ({ taskId }) => [taskId],
    payloadFor: (payload) => payload,
  }),
};
