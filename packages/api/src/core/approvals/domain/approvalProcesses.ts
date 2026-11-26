/** The ready-made process that asks the requester's manager, or else the owner, to approve. */
export const MANAGER_APPROVAL = "manager_approval";

/** The processes a feature may name for an approval; approvals seeds each of them. */
export const APPROVAL_PROCESS_KEYS: readonly string[] = [MANAGER_APPROVAL];
