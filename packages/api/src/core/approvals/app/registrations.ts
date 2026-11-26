// What this module adds to core's shared registries.

declare module "../../events" {
  interface DomainEvents {
    /** A feature asked for approval of its record; the approval process it names starts on it. */
    "approvals.approval_requested": {
      approvalProcessKey: string;
      recordType: string;
      recordId: string;
      requesterEmployeeId: string;
      title: string;
      description: string | null;
    };
    /** Requests whose run must have started by the next round before the commit, by event id. */
    "approvals.approval_start_expected": { eventIds: string[] };
    /**
     * An approval ended, published before the commit of the change that ended it: with its outcome,
     * or why there is none.
     */
    "approvals.approval_finished": {
      approvalProcessKey: string;
      recordType: string;
      recordId: string;
      runId: string;
      outcome: { code: string; comment: string | null; byEmployeeId: string | null } | null;
      endedWithoutOutcome: "run_cancelled" | "no_approver" | null;
    };
  }
}

export {};
