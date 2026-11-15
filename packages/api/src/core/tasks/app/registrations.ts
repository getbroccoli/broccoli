// What this module adds to core's shared registries.
import type { TaskStatus } from "../domain";

declare module "../../records" {
  interface RecordTypes {
    /** A task's own changes; its assignee and asker read them through the task, not `recordHistory`. */
    task: true;
  }
}

declare module "../../events" {
  interface DomainEvents {
    /** A task to do was created; `byEmployeeId` is the person who created it, null for Broccoli. */
    "tasks.task_created": {
      taskId: string;
      /** `manual_to_do`, or the type of the feature that created it. */
      type: string;
      assigneeEmployeeId: string;
      askedByEmployeeId: string | null;
      subjectEmployeeId: string | null;
      /** What created it, as its creator named it, such as a process's key; null for a person. */
      sourceKey: string | null;
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
