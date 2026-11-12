// What this module adds to core's shared registries.

declare module "../../../core/records" {
  interface RecordTypes {
    /** A process's own changes, such as turning it on; admins read them through the process. */
    process: true;
  }

  interface CauseKinds {
    /** A process run made the change on its own, such as creating or cancelling a step's task; the ref is the run. */
    PROCESS_RUN: true;
  }
}

declare module "../../../core/jobs" {
  interface Jobs {
    "processes.startDueRuns": Record<never, never>;
  }
}

declare module "../../../core/events" {
  interface DomainEvents {
    /** Runs started in the transaction whose events triggered them; after-commit handlers get it only once it commits. */
    "processes.runs_started_on_event": { processKey: string; runIds: string[]; eventIds: string[] };
  }
}

export {};
