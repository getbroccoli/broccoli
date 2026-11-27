/** What permission checks read about people; the module that keeps employees provides it. */
export interface EmployeeDirectory {
  /** The employee linked to this user; null without one. */
  employeeIdOfUser(userId: string): Promise<string | null>;
  /**
   * Everyone above each employee today, by employee: their direct manager first, then that one's,
   * and so on; employees without a manager are left out.
   */
  managersAbove(employeeIds: readonly string[]): Promise<Map<string, string[]>>;
  /** Everyone below the employee today, with their depth: 1 for a direct report, and so on. */
  reportsBelow(employeeId: string): Promise<{ id: string; depth: number }[]>;
  /** The employee linked to the owner's user; null without one. */
  ownersEmployeeId(): Promise<string | null>;
  /**
   * The user linked to each employee that exists, by employee: null for one who never joined;
   * an id that names no employee is left out.
   */
  usersOfEmployees(employeeIds: readonly string[]): Promise<Map<string, string | null>>;
}
