// What this module adds to core's shared registries.
import type { TaskStatus } from "../domain";

declare module "../../../core/records" {
  interface RecordTypes {
    /** A task's own changes; its assignee and asker read them through the task, not `recordHistory`. */
    task: true;
  }
}

declare module "../../../core/events" {
  interface DomainEvents {
    /** A task to do was created; `byEmployeeId` is the person who created it, null for Broccoli. */
    "tasks.task_created": {
      taskId: string;
      assigneeEmployeeId: string;
      askedByEmployeeId: string | null;
      subjectEmployeeId: string | null;
      /** The process whose step created it, else null. */
      processKey: string | null;
      byEmployeeId: string | null;
    };
    /** A task's status changed; `byEmployeeId` is the person who changed it, null for Broccoli. */
    "tasks.task_status_changed": {
      taskId: string;
      from: TaskStatus;
      to: TaskStatus;
      byEmployeeId: string | null;
    };
  }
}
