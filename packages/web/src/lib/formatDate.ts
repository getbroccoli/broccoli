// Formatted in UTC from a UTC timestamp, so no time zone moves the calendar day.
const calendarDateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeZone: "UTC",
});

/** Formats a `YYYY-MM-DD` calendar date for display in the browser's locale. */
export function formatCalendarDate(value: string | null): string | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return calendarDateFormat.format(Date.UTC(year!, month! - 1, day));
}
