import type { ModuleDependencies, ModuleManifest } from "../moduleManifest";
import type { ApprovalService } from "./app";

// Public values.
export { APPROVAL_TRIGGERING_EVENTS, createApprovalService } from "./app";
export { MANAGER_APPROVAL, OWNER_APPROVAL } from "./domain";

// Public types.
export type { ApprovalRequest, ApprovalService } from "./app";
export type { ApprovalProcessKey } from "./domain";

/** Approvals: a feature asks, an approval process decides, and the feature hears how it ended. */
export function approvalsModule({
  logger,
  approvals,
}: Pick<ModuleDependencies, "logger"> & { approvals: ApprovalService }): ModuleManifest {
  return {
    name: "approvals",
    eventsBeforeCommit: approvals.followApprovals,
    events: {
      // Logged once the change commits, with identifiers only.
      "approvals.approval_requested": ({ approvalProcessKey, recordType, recordId }) =>
        Promise.resolve(
          logger.info({ approvalProcessKey, recordType, recordId }, "Approval requested"),
        ),
      "approvals.approval_finished": ({ outcome, ...finished }) =>
        Promise.resolve(
          logger.info({ ...finished, outcomeCode: outcome?.code ?? null }, "Approval finished"),
        ),
    },
  };
}
