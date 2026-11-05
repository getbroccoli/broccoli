import { addDays, addYears, type CalendarDate } from "../../../utils";
import type { AllowanceRule, DatedPolicy } from "./allowanceCalculator";
import type { TimeOffTypeColour, TimeOffTypeIcon } from "./timeOffTypeLook";

/** The standard leave policies' keys, by which code finds them. */
export type StandardLeavePolicyKey =
  "uk_statutory_minimum" | "uk_20_days_plus_bank_holidays" | "uk_25_days_plus_bank_holidays";

/** The keys of the four seeded time off types. */
export type TimeOffTypeKey = "annual_leave" | "sickness" | "family_leave" | "other";

/** A kind of time off; null icon and colour mean the defaults. */
export interface TimeOffType {
  id: string;
  name: string;
  /** Colleagues see that the person is off, not why. */
  private: boolean;
  typeKey: TimeOffTypeKey | null;
  icon: TimeOffTypeIcon | null;
  colour: TimeOffTypeColour | null;
}

/** A policy with its type and allowance rules. */
export interface TimeOffPolicy {
  id: string;
  name: string;
  key: StandardLeavePolicyKey | null;
  timeOffType: TimeOffType;
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
  leaveYear: NonNullable<TimeOffPolicy["leaveYear"]>,
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
