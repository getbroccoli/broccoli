// What this module adds to core's shared registries.

declare module "../../records" {
  interface RecordTypes {
    /** A process's own changes, such as turning it on; admins read them through the process. */
    process: true;
  }

  interface CauseKinds {
    /** A process run made the change on its own, such as creating or cancelling a step's task; the ref is the run. */
    PROCESS_RUN: true;
  }
}

declare module "../../jobs" {
  interface Jobs {
    "processes.startDueRuns": Record<never, never>;
    /** Starts a process version's runs for an event after the change that published it commits. */
    "processes.startRunsAfterCommit": {
      processId: string;
      versionId: string;
      /** How many after-commit jobs led here, this one included. */
      hop: number;
      event: { id: string; type: string; payload: unknown };
    };
  }
}

declare module "../../events" {
  interface DomainEvents {
    /** Runs started on events, with the change or in an after-commit job; after-commit handlers get it once that commits. */
    "processes.runs_started_on_event": { processKey: string; runIds: string[]; eventIds: string[] };
    /** Runs queued to start in a job once the change commits; logged only then. */
    "processes.runs_queued_after_commit": {
      processKey: string;
      eventId: string;
      eventType: string;
      hop: number;
      recordCount: number;
    };
    /**
     * A run's steps completed as their tasks were marked done, and the steps that started after
     * them or will never start; logged once the change commits.
     */
    "processes.steps_completed": {
      runId: string;
      taskIds: string[];
      startedStepKeys: string[];
      notReachedStepKeys: string[];
      runStatus: string;
    };
  }
}

export {};
