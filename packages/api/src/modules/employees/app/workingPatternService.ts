import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { HistoryLine } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import type { WeekdayMinutes, WorkingPatternPolicy, WorkingWeek } from "../domain";

/**
 * Working patterns: the policies groups and people are put on from a date, and the working weeks
 * other modules read. Every change is dated; a past date is a correction.
 */
export interface WorkingPatternService {
  /**
   * Each employee's working weeks from `from` to `until`, by id: the first starts on `from`, a new
   * one wherever minutes or full day change. Refuses with FORBIDDEN an employee whose working
   * pattern the caller may not read.
   */
  readWorkingWeeks: (
    ctx: SecurityContext,
    input: { employeeIds: readonly string[]; from: string; until: string },
  ) => Promise<Map<string, WorkingWeek[]>>;
  /** Every policy with its weeks, by name. Admins only. */
  listPolicies: (ctx: SecurityContext) => Promise<WorkingPatternPolicy[]>;
  /** A new policy whose only week applies from the beginning. Admins only. */
  createPolicy: (
    ctx: SecurityContext,
    input: { name: string; minutes: WeekdayMinutes; fullDayMinutes: number },
  ) => Promise<WorkingPatternPolicy>;
  /** Renames a policy for every date. Admins only. */
  renamePolicy: (
    ctx: SecurityContext,
    input: { policyId: string; name: string },
  ) => Promise<WorkingPatternPolicy>;
  /** New minutes for a policy from a date, replacing a week that starts on it. Admins only. */
  changePolicy: (
    ctx: SecurityContext,
    input: {
      policyId: string;
      effectiveFrom: string;
      minutes: WeekdayMinutes;
      fullDayMinutes: number;
    },
  ) => Promise<WorkingPatternPolicy>;
  /** Removes the week that starts on a date, so the one before applies again. Admins only. */
  removePolicyWeek: (
    ctx: SecurityContext,
    input: { policyId: string; effectiveFrom: string },
  ) => Promise<WorkingPatternPolicy>;
  /** Deletes a policy no group or person is put on, other than Standard. Admins only. */
  deletePolicy: (ctx: SecurityContext, input: { policyId: string }) => Promise<void>;
  /** Puts a group on a policy from a date; its earlier policy ends the day before. Admins only. */
  setGroupPattern: (
    ctx: SecurityContext,
    input: { policyGroupId: string; policyId: string; effectiveFrom: string },
  ) => Promise<void>;
  /** Ends the group's policy on a date; the group then has none. Admins only. */
  endGroupPattern: (
    ctx: SecurityContext,
    input: { policyGroupId: string; effectiveUntil: string },
  ) => Promise<void>;
  /** Removes the group's policy that starts on a date, null for from the beginning. Admins only. */
  removeGroupPattern: (
    ctx: SecurityContext,
    input: { policyGroupId: string; effectiveFrom: string | null },
  ) => Promise<void>;
  /**
   * Puts a person on their own policy from a date, until a date or open-ended, ahead of their
   * group's; an earlier one of theirs ends the day before. Returns the history line it added.
   */
  assignPolicy: (
    ctx: SecurityContext,
    input: {
      employeeId: string;
      policyId: string;
      effectiveFrom: string;
      effectiveUntil?: string | null;
    },
  ) => Promise<HistoryLine>;
  /** Ends a person's own policy on a date; their group's applies from the next day. */
  endAssignment: (
    ctx: SecurityContext,
    input: { employeeId: string; effectiveUntil: string },
  ) => Promise<HistoryLine>;
  /** Removes a person's own policy that starts on a date, as a correction. */
  removeAssignment: (
    ctx: SecurityContext,
    input: { employeeId: string; effectiveFrom: string },
  ) => Promise<HistoryLine>;
}

export function createWorkingPatternService(
  _dependencies: Pick<ModuleDependencies, "orm" | "transact" | "logger">,
): WorkingPatternService {
  const notBuilt = () => Promise.reject(new Error("Not built yet"));
  return {
    readWorkingWeeks: notBuilt,
    listPolicies: notBuilt,
    createPolicy: notBuilt,
    renamePolicy: notBuilt,
    changePolicy: notBuilt,
    removePolicyWeek: notBuilt,
    deletePolicy: notBuilt,
    setGroupPattern: notBuilt,
    endGroupPattern: notBuilt,
    removeGroupPattern: notBuilt,
    assignPolicy: notBuilt,
    endAssignment: notBuilt,
    removeAssignment: notBuilt,
  };
}
