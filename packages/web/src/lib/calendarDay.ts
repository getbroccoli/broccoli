/** The calendar day of `date` in `timeZone` (the browser's by default), as `YYYY-MM-DD` (the en-CA format). */
export function calendarDayOf(date: Date, timeZone?: string): string {
  // en-CA leaves out a year's leading zeros, such as 999-06-01.
  return new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" })
    .format(date)
    .padStart(10, "0");
}

/** A `YYYY-MM-DD` day as its year, zero-based month and date, as `Date.UTC` takes them. */
export function calendarDayParts(day: string): [number, number, number] {
  const [year, month, date] = day.split("-").map(Number);
  return [year!, month! - 1, date!];
}

/** A `YYYY-MM-DD` day as UTC midnight, for any year; `Date.UTC` reads years 0 to 99 as 1900 to 1999. */
export function utcDay(day: string): Date {
  const date = new Date(0);
  date.setUTCFullYear(...calendarDayParts(day));
  return date;
}

/** The `YYYY-MM-DD` day `days` after `day`; negative goes back. */
export function addDays(day: string, days: number): string {
  const date = utcDay(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
