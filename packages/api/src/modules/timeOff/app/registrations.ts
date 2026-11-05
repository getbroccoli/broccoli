// What this module adds to core's shared registries.
import type { TurnedOnTimeOff } from "./timeOffService";

declare module "../../../core/records" {
  interface RecordTypes {
    time_off_type: true;
  }
}

declare module "../../../core/events" {
  interface DomainEvents {
    /** Time off was turned on: the terms set up, their Annual leave policies and the allowances made. */
    "timeOff.time_off_turned_on": TurnedOnTimeOff & {
      timeOffPolicyIds: string[];
      locationCount: number;
    };
    /** A time off type was saved from Settings: what changed and how many allowances moved. */
    "timeOff.time_off_type_saved": {
      timeOffTypeId: string;
      fields: string[];
      changedPolicyIds: string[];
      addedPolicyIds: string[];
      deletedPolicyIds: string[];
      allowancesUpdated: number;
    };
    /** A time off type nobody had used was deleted, with its policies. */
    "timeOff.time_off_type_deleted": { timeOffTypeId: string; deletedPolicyIds: string[] };
  }
}

declare module "../../../core/jobs" {
  interface Jobs {
    "timeOff.ensureAllowances": Record<never, never>;
  }
}

export {};
