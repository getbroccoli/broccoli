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
    /** Runs of the process started with the change whose events triggered them, now committed. */
    "processes.runs_started_on_event": { processKey: string; runIds: string[]; eventIds: string[] };
  }
}

export {};
