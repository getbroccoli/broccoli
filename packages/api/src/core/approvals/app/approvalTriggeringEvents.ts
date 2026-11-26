import type { DomainEvents } from "../../events";
import { FROM_EVENT } from "../../processes";

/** The request that starts an approval process, on the record it names; the composition gives it to processes. */
export const APPROVAL_TRIGGERING_EVENTS = {
  "approvals.approval_requested": {
    recordType: FROM_EVENT,
    recordTypeOf: (payload: unknown) =>
      (payload as DomainEvents["approvals.approval_requested"]).recordType,
    recordIds: ({ recordId }: DomainEvents["approvals.approval_requested"]) => [recordId],
    payloadFor: (payload: DomainEvents["approvals.approval_requested"]) => payload,
  },
};
