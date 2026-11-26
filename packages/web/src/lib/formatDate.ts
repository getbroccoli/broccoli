import { utcDay } from "./calendarDay";

// Formatted in UTC from a UTC timestamp, so no time zone moves the calendar day.
const calendarDateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "short",
  timeZone: "UTC",
});

/** Formats a `YYYY-MM-DD` calendar date for display as DD/MM/YYYY. */
export function formatCalendarDate(value: string | null): string | null {
  if (!value) return null;
  return calendarDateFormat.format(utcDay(value));
}

/** A booking's dates with their year: "7–9 Dec 2026", or "30 Dec 2026 – 4 Jan 2027" across years. */
export function bookingDates(from: string, until: string): string {
  return from.slice(0, 4) === until.slice(0, 4)
    ? `${dateRange(from, until)} ${from.slice(0, 4)}`
    : `${dayMonthYear(from)} – ${dayMonthYear(until)}`;
}

/** "Tue 8 Dec". */
export function weekdayDay(date: string): string {
  return format(date, { weekday: "short", day: "numeric", month: "short" });
}

/** "4 Jan 2027". */
export function dayMonthYear(date: string): string {
  return format(date, { day: "numeric", month: "short", year: "numeric" });
}

/** "7–9 Dec", "30 Dec – 4 Jan", or "3 Nov" for one day. */
export function dateRange(from: string, until: string): string {
  if (from === until) {
    return format(from, { day: "numeric", month: "short" });
  }
  if (from.slice(0, 7) === until.slice(0, 7)) {
    return `${Number(from.slice(8))}–${format(until, { day: "numeric", month: "short" })}`;
  }
  return `${format(from, { day: "numeric", month: "short" })} – ${format(until, { day: "numeric", month: "short" })}`;
}

function format(date: string, options: Intl.DateTimeFormatOptions): string {
  // en-GB puts a comma after the weekday; the copy reads "Tue 8 Dec".
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" })
    .format(utcDay(date))
    .replace(",", "");
}
