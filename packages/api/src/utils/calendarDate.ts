const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/** A `YYYY-MM-DD` day that exists; only `parseCalendarDate` makes one. */
export type CalendarDate = string & { readonly __brand: "CalendarDate" };

/** A `YYYY-MM-DD` day that exists, or undefined (`2026-02-30`, `2026-1-1`). */
export function parseCalendarDate(value: string): CalendarDate | undefined {
  if (!DATE_FORMAT.test(value)) {
    return undefined;
  }
  const date = new Date(`${value}T00:00:00Z`);
  const exists = !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  return exists ? (value as CalendarDate) : undefined;
}

/** The day `days` after `date`, or before it when negative. */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  const [year, month, day] = date.split("-").map(Number);
  // In UTC every day has 24 hours, so adding days never lands on another hour.
  return new Date(Date.UTC(year!, month! - 1, day! + days))
    .toISOString()
    .slice(0, 10) as CalendarDate;
}

/** Today as a calendar day in UTC. */
export function todayInUtc(): CalendarDate {
  return new Date().toISOString().slice(0, 10) as CalendarDate;
}
