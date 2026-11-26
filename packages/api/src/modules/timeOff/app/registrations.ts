// What this module adds to core's shared registries.
import type { StandardLeavePolicyKey } from "../domain";
import type { TurnedOnTimeOff } from "./timeOffService";

declare module "../../../core/events" {
  interface DomainEvents {
    /** Time off was turned on: the terms set up, their Annual leave policies and the allowances made. */
    /** Requested time off was approved, rejected, or cancelled when its approval ended without a decision. */
    "timeOff.request_decided": {
      timeOffId: string;
      employeeId: string;
      runId: string;
      status: "approved" | "rejected" | "cancelled";
      /** The allowance lines the approval appended; 0 otherwise. */
      linesAppended: number;
    };
    "timeOff.time_off_turned_on": TurnedOnTimeOff & {
      annualLeavePolicyKeys: StandardLeavePolicyKey[];
      locationCount: number;
    };
  }
}

declare module "../../../core/records" {
  interface RecordTypes {
    /** A person's time off; the record id is the time off's. */
    time_off: true;
  }
}

declare module "../../../core/jobs" {
  interface Jobs {
    "timeOff.ensureAllowances": Record<never, never>;
  }
}

export {};
