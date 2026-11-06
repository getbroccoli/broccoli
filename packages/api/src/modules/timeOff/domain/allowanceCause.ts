import type { CalendarDate } from "../../../utils";

/** Why the engine appended a line, with the id or date it points at. */
export type AllowanceCause =
  | {
      kind: "START_DATE_CHANGED";
      /** The new start remains the stored cause reference. */
      ref: CalendarDate | null;
      previousStartDate: CalendarDate | null;
    }
  | {
      kind:
        | "TIME_OFF_TURNED_ON"
        | "EMPLOYEE_ADDED"
        | "WORKING_PATTERN_CHANGED"
        | "LEAVE_YEAR_STARTED"
        | "DAILY_CHECK";
      /** The terms id, employee id or date the cause names; null when it names none. */
      ref: string | null;
    };
