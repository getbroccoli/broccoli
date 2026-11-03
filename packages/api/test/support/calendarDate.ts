import { type CalendarDate, parseCalendarDate } from "../../src/utils";

/** The `YYYY-MM-DD` day `value`; throws when it does not exist. */
export function calendarDate(value: string): CalendarDate {
  const date = parseCalendarDate(value);
  if (!date) {
    throw new Error(`${value} is not a calendar date`);
  }
  return date;
}
