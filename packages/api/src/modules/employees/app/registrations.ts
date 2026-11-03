// What this module adds to core's shared registries.

import type { CalendarDate } from "../../../utils";
import type { SendInviteJob } from "./invites/sendInviteJob";

declare module "../../../core/jobs" {
  interface Jobs {
    "employees.sendInvite": SendInviteJob;
  }
}

declare module "../../../core/events" {
  interface DomainEvents {
    /** People added individually, by import approval or with the demo, in one transaction. */
    "employees.added": { employeeIds: string[] };
    /** The person's first employment now starts on this date, or has no known start date. */
    "employees.start_date_changed": { employeeId: string; startDate: CalendarDate | null };
    /**
     * The working weeks of these employees may have changed from `from` on, null from the
     * beginning; a reader recalculates what depends on them from that date.
     */
    "employees.working_pattern_changed": { employeeIds: string[]; from: CalendarDate | null };
  }
}

declare module "../../../core/records" {
  interface RecordTypes {
    employee: true;
    /** A person's own working pattern changes; the record id is the employee's. */
    working_pattern: true;
  }
  interface CauseKinds {
    /** The person's manager was removed, so they have none; the line's `manager` change names them. No ref. */
    MANAGER_REMOVED: true;
    /** An admin invited the person to sign in, or made them a new link; the ref is the invite. */
    INVITE_SENT: true;
    /** An admin cancelled the person's open invite; the ref is the invite. */
    INVITE_CANCELLED: true;
    /** The person accepted their invite and signed in for the first time; the ref is the invite. */
    INVITE_ACCEPTED: true;
  }
}
