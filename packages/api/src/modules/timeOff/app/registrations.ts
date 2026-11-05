// What this module adds to core's shared registries.
import type { TurnedOnTimeOff } from "./timeOffService";

declare module "../../../core/events" {
  interface DomainEvents {
    /** Time off was turned on: the terms set up, their Annual leave policies and the allowances made. */
    "timeOff.time_off_turned_on": TurnedOnTimeOff & {
      timeOffPolicyIds: string[];
      locationCount: number;
    };
  }
}

declare module "../../../core/jobs" {
  interface Jobs {
    "timeOff.ensureAllowances": Record<never, never>;
  }
}

export {};
