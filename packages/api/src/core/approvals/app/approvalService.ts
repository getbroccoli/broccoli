import { ApplicationError, invalidInput } from "../../applicationError";
import type { BeforeCommitHandler, Tx } from "../../db";
import type { DomainEvents, PublishedEvent } from "../../events";
import type { ProcessService } from "../../processes";
import type { SecurityContext } from "../../security";
import { APPROVAL_PROCESS_KEYS } from "../domain";

/** Asking for approval of a record, and telling the feature how it ended. */
export interface ApprovalService {
  /**
   * Asks for approval of a record, in the caller's transaction (the feature authorized it):
   * publishes `approvals.approval_requested`; before the commit the approval process starts one
   * run, or the transaction fails.
   */
  requestApproval(ctx: SecurityContext, tx: Tx, request: ApprovalRequest): Promise<void>;
  /**
   * Withdraws a record from its approval, in the caller's transaction (the feature authorized it):
   * cancels its run in progress and the approver's open task with the reason; before the commit the
   * feature hears `approvals.approval_finished` with `run_cancelled`. Null when none is in progress.
   */
  cancelApproval(
    ctx: SecurityContext,
    tx: Tx,
    withdrawal: { record: ApprovalRequest["record"]; reason: string },
  ): Promise<{ runId: string } | null>;
  /**
   * Before the commit: fails the transaction when a request started no run, and turns each ended
   * approval run into `approvals.approval_finished`.
   */
  followApprovals: BeforeCommitHandler;
}

/** What a feature asks approval for: its record, who asks, and the words of the approver's task. */
export interface ApprovalRequest {
  approvalProcessKey: string;
  record: { recordType: string; recordId: string };
  requesterEmployeeId: string;
  title: string;
  description: string | null;
}

/** Why a request started no run, as the feature's caller reads it. */
const APPROVAL_NOT_STARTED =
  "The approval could not start: its process is off or this record already has an approval in progress.";

export function createApprovalService({
  processes,
}: {
  processes: Pick<ProcessService, "cancelRunOfRecord">;
}): ApprovalService {
  return {
    requestApproval(_ctx, tx, { approvalProcessKey, record, requesterEmployeeId, ...words }) {
      if (!APPROVAL_PROCESS_KEYS.includes(approvalProcessKey)) {
        throw new ApplicationError("INVALID_INPUT", "No approval process has this key.", [
          { field: "approvalProcessKey", code: "unknown" },
        ]);
      }
      const title = words.title.trim();
      if (!title) throw invalidInput([{ field: "title", code: "required" }]);
      tx.publish("approvals.approval_requested", {
        approvalProcessKey,
        ...record,
        requesterEmployeeId,
        title,
        description: words.description?.trim() || null,
      });
      return Promise.resolve();
    },

    async cancelApproval(ctx, tx, { record, reason }) {
      const run = await processes.cancelRunOfRecord(tx, {
        processKeys: APPROVAL_PROCESS_KEYS,
        ...record,
        reason,
        byEmployeeId: ctx.user?.employeeId ?? null,
      });
      return run && { runId: run.id };
    },

    followApprovals(tx, events) {
      expectStarts(tx, events);
      refuseRequestsNotStarted(events);
      finishEndedApprovals(tx, events);
      return Promise.resolve();
    },
  };
}

/**
 * Asks the next round to check this round's requests: processes start their runs in this round,
 * whatever order the handlers run in, so their start events arrive with the check.
 */
function expectStarts(tx: Tx, events: readonly PublishedEvent[]): void {
  const eventIds = events.flatMap(({ id, type }) =>
    type === "approvals.approval_requested" ? [id] : [],
  );
  if (eventIds.length > 0) tx.publish("approvals.approval_start_expected", { eventIds });
}

function refuseRequestsNotStarted(events: readonly PublishedEvent[]): void {
  const started = new Set(
    events.flatMap((event) =>
      event.type === "processes.runs_started_on_event" &&
      APPROVAL_PROCESS_KEYS.includes(event.payload.processKey)
        ? event.payload.eventIds
        : [],
    ),
  );
  for (const event of events) {
    if (event.type !== "approvals.approval_start_expected") continue;
    if (event.payload.eventIds.some((id) => !started.has(id))) {
      throw new ApplicationError("CONFLICT", APPROVAL_NOT_STARTED);
    }
  }
}

function finishEndedApprovals(tx: Tx, events: readonly PublishedEvent[]): void {
  for (const event of events) {
    if (event.type !== "processes.run_ended") continue;
    if (!APPROVAL_PROCESS_KEYS.includes(event.payload.processKey)) continue;
    tx.publish("approvals.approval_finished", approvalFinished(event.payload));
  }
}

function approvalFinished({
  runId,
  processKey,
  recordType,
  recordId,
  status,
  outcome,
}: DomainEvents["processes.run_ended"]): DomainEvents["approvals.approval_finished"] {
  return {
    approvalProcessKey: processKey,
    recordType,
    recordId,
    runId,
    outcome,
    endedWithoutOutcome: outcome ? null : status === "cancelled" ? "run_cancelled" : "no_approver",
  };
}
