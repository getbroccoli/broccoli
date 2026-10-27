// What this module adds to core's shared registries.

declare module "../../../core/records" {
  interface RecordTypes {
    employee: true;
  }
  interface CauseKinds {
    /** The person's manager was removed, so they have none. */
    MANAGER_REMOVED: true;
  }
}

export {};
