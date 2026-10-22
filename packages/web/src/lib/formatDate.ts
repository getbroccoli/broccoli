// Formatted in UTC from a UTC timestamp, so no time zone moves the calendar day.
const calendarDateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "short",
  timeZone: "UTC",
});

/** Formats a `YYYY-MM-DD` calendar date for display as DD/MM/YYYY. */
export function formatCalendarDate(value: string | null): string | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return calendarDateFormat.format(Date.UTC(year!, month! - 1, day));
}
