import { addDays, addYears, type CalendarDate } from "../../../utils";
import type { AllowanceRule, DatedPolicy } from "./allowanceCalculator";
import type { TimeOffTypeColour, TimeOffTypeIcon } from "./timeOffTypeLook";

/** The keys of the four seeded time off types. */
export type TimeOffTypeKey = "annual_leave" | "sickness" | "family_leave" | "other";

/** What a type's time off is counted in; only days are counted so far. */
export const TIME_OFF_UNITS = ["day", "hour"] as const;
export type TimeOffUnit = (typeof TIME_OFF_UNITS)[number];

/** A kind of time off; null icon and colour mean the defaults. */
export interface TimeOffType {
  id: string;
  name: string;
  typeKey: TimeOffTypeKey | null;
  unit: TimeOffUnit;
  icon: TimeOffTypeIcon | null;
  colour: TimeOffTypeColour | null;
  /** Colleagues see that the person is off, not why. Always true for Sickness. */
  private: boolean;
}

/** A policy for one type: one set of terms' own, or a named one people are put on one by one. */
export interface TimeOffPolicy {
  id: string;
  timeOffType: TimeOffType;
  /** Null: a named policy for one person at a time. */
  termsId: string | null;
  /** Null on a terms' policy. */
  name: string | null;
  /** Oldest first, never overlapping. */
  versions: PolicyVersion[];
}

/** A policy's rules from a date to a date; never edited, only ended. */
export interface PolicyVersion {
  id: string;
  /** Null: from the beginning. */
  startDate: CalendarDate | null;
  /** The last day it applies; null: open-ended. */
  endDate: CalendarDate | null;
  balance: DatedPolicy["balance"];
  bankHolidays: DatedPolicy["bankHolidays"];
  /** Null for a `no_balance` policy. */
  leaveYear:
    | { kind: "leave_year_from_fixed_date"; month: number; day: number }
    | { kind: "leave_year_from_employee_start_date" }
    | null;
  rules: AllowanceRule[];
}

/**
 * The policy's leave year containing `date`: from its fixed date, or from the anniversary of
 * `serviceStart`, falling back to 1 January when the start is unknown.
 */
export function leaveYearContaining(
  leaveYear: NonNullable<PolicyVersion["leaveYear"]>,
  serviceStart: CalendarDate | null,
  date: CalendarDate,
): { start: CalendarDate; end: CalendarDate } {
  const origin =
    leaveYear.kind === "leave_year_from_fixed_date"
      ? (`2000-${pad(leaveYear.month)}-${pad(leaveYear.day)}` as CalendarDate)
      : (serviceStart ?? ("2000-01-01" as CalendarDate));
  // Each boundary is counted from the origin, so a 29 February start keeps its anniversary.
  let years = Number(date.slice(0, 4)) - Number(origin.slice(0, 4));
  if (addYears(origin, years) > date) {
    years -= 1;
  }
  return { start: addYears(origin, years), end: addDays(addYears(origin, years + 1), -1) };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
