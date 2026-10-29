// What this module adds to core's shared registries.

import type { SendInviteJob } from "./invites/sendInviteJob";

declare module "../../../core/jobs" {
  interface Jobs {
    "employees.sendInvite": SendInviteJob;
  }
}

declare module "../../../core/records" {
  interface RecordTypes {
    employee: true;
  }
  interface CauseKinds {
    /** The person's manager was removed, so they have none. */
    MANAGER_REMOVED: true;
    /** An admin invited the person to sign in, or made them a new link; the ref is the invite. */
    INVITE_SENT: true;
    /** An admin cancelled the person's open invite; the ref is the invite. */
    INVITE_CANCELLED: true;
    /** The person accepted their invite and signed in for the first time; the ref is the invite. */
    INVITE_ACCEPTED: true;
  }
}
