/** The calendar day of `date` in `timeZone` (the browser's by default), as `YYYY-MM-DD` (the en-CA format). */
export function calendarDayOf(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(date);
}

/** A `YYYY-MM-DD` day as its year, zero-based month and date, as `Date.UTC` takes them. */
export function calendarDayParts(day: string): [number, number, number] {
  const [year, month, date] = day.split("-").map(Number);
  return [year!, month! - 1, date!];
}

/** The `YYYY-MM-DD` day after `day`. */
export function dayAfter(day: string): string {
  const [year, month, date] = calendarDayParts(day);
  return calendarDayOf(new Date(Date.UTC(year, month, date + 1)), "UTC");
}
