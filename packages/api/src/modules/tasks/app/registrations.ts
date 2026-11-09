// What this module adds to core's shared registries.

declare module "../../../core/records" {
  interface RecordTypes {
    /** A task's own changes; its holder and asker read them through the task, not `recordHistory`. */
    task: true;
  }
}

export {};
