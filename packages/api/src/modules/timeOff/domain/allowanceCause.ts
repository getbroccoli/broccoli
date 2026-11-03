/** Why the engine appended a line, with the id or date it points at. */
export interface AllowanceCause {
  kind:
    | "POLICY_LINKED_TO_GROUP"
    | "EMPLOYEE_ADDED"
    | "START_DATE_CHANGED"
    | "WORKING_PATTERN_CHANGED"
    | "LEAVE_YEAR_STARTED"
    | "DAILY_CHECK";
  /** The group id, employee id or date the cause names; null when it names none. */
  ref: string | null;
}
