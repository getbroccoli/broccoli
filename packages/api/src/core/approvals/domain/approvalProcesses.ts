/** The ready-made process that asks the manager of the person a request is about, or else the owner. */
export const MANAGER_APPROVAL = "manager_approval";

/** The processes a feature may name for an approval; approvals seeds each of them. */
export const APPROVAL_PROCESS_KEYS: readonly string[] = [MANAGER_APPROVAL];
