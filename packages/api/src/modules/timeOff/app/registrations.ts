// What this module adds to core's shared registries.
import type { TurnedOnLeave } from "./timeOffService";

declare module "../../../core/events" {
  interface DomainEvents {
    /** Leave was turned on: the terms set up, their Annual leave policies and the allowances made. */
    "timeOff.leave_turned_on": TurnedOnLeave & {
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
