import { invalidInput } from "../../../core/applicationError";
import { type CalendarDate, parseCalendarDate } from "../../../utils";

/** Whose bank holidays apply: one nation's, as GOV.UK publishes them. */
export const BANK_HOLIDAY_CALENDARS = [
  "england_and_wales",
  "scotland",
  "northern_ireland",
] as const;
export type BankHolidayCalendar = (typeof BANK_HOLIDAY_CALENDARS)[number];

/** One bank holiday of a calendar. */
export interface BankHolidayDay {
  date: CalendarDate;
  name: string;
}

/** A calendar sent as `bankHolidayCalendar`; refuses one that is not known. */
export function parseBankHolidayCalendar(value: string): BankHolidayCalendar {
  const calendar = BANK_HOLIDAY_CALENDARS.find((known) => known === value);
  if (!calendar) {
    throw invalidInput([{ field: "bankHolidayCalendar", code: "invalid" }]);
  }
  return calendar;
}

/** A `YYYY-MM-DD` date sent in `field`; refuses anything else. */
export function parsePeriodDate(field: string, value: string): CalendarDate {
  const date = parseCalendarDate(value);
  if (!date) {
    throw invalidInput([{ field, code: "invalid" }]);
  }
  return date;
}
