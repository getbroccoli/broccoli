import type { Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import type { CalendarDate } from "../../../utils";

/** Why employments changed: people added, or one person's start date moved to `ref`. */
export type EmploymentChangeCause =
  { kind: "EMPLOYEE_ADDED"; ref: null } | { kind: "START_DATE_CHANGED"; ref: CalendarDate | null };

/**
 * What another module does when people are added or their employment changes, in the same
 * transaction; startup fills it, since this module imports none that cares.
 */
export interface EmploymentChanges {
  afterEmploymentsChanged: (
    ctx: SecurityContext,
    tx: Tx,
    change: { employeeIds: readonly string[]; cause: EmploymentChangeCause },
  ) => Promise<void>;
}

/** No one listens: setup's reads and deletions add no one. */
export const noEmploymentChanges: EmploymentChanges = {
  async afterEmploymentsChanged() {},
};
