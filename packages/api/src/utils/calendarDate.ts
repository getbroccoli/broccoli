const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/** A `YYYY-MM-DD` day that exists; only `parseCalendarDate` makes one. */
export type CalendarDate = string & { readonly __brand: "CalendarDate" };

/** Which part of a `d/m/yyyy` or `m/d/yyyy` date is the day. */
export type DateOrder = "dayFirst" | "monthFirst";

/**
 * A `YYYY-MM-DD` day that exists, or undefined (`2026-02-30`, `2026-1-1`). With an
 * `order`, a day written as `d.m.yyyy` or `m.d.yyyy` (`/`, `.` or `-`) is read too.
 */
export function parseCalendarDate(value: string, order?: DateOrder): CalendarDate | undefined {
  const numeric = order && NUMERIC_DATE.exec(value);
  if (numeric) {
    const [, first, second, year] = numeric;
    const [day, month] = order === "dayFirst" ? [first!, second!] : [second!, first!];
    return parseCalendarDate(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
  }
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

/** The same day `years` later; 29 February becomes 1 March in other years. */
export function addYears(date: CalendarDate, years: number): CalendarDate {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year! + years, month! - 1, day))
    .toISOString()
    .slice(0, 10) as CalendarDate;
}

/** How many days `until` is after `from`; negative when it is before. */
export function daysBetween(from: CalendarDate, until: CalendarDate): number {
  return (Date.parse(until) - Date.parse(from)) / MILLISECONDS_IN_A_DAY;
}

/** The day of the week, 0 for Monday to 6 for Sunday. */
export function weekdayOf(date: CalendarDate): number {
  return (new Date(date).getUTCDay() + 6) % 7;
}

/** Whether `date` is from `from` to `until`, both included; a null end is open. */
export function isWithin(
  date: CalendarDate,
  from: CalendarDate | null,
  until: CalendarDate | null,
): boolean {
  return (from === null || from <= date) && (until === null || date <= until);
}

/** Today as a calendar day in UTC. */
export function todayInUtc(): CalendarDate {
  return new Date().toISOString().slice(0, 10) as CalendarDate;
}

/**
 * A column of dates: ISO, or d/m/yyyy or m/d/yyyy with `/`, `.` or `-`. The order is
 * read from the whole column; when no cell tells, only ISO dates are read.
 */
export function parseDateColumn(cells: readonly string[]): (CalendarDate | null)[] {
  // Only a date that exists in exactly one order tells the order; impossible dates tell nothing.
  const tells = (order: DateOrder, other: DateOrder) =>
    cells.some((cell) => parseCalendarDate(cell, order) && !parseCalendarDate(cell, other));
  const dayFirst = tells("dayFirst", "monthFirst");
  const order =
    dayFirst === tells("monthFirst", "dayFirst") ? undefined : dayFirst ? "dayFirst" : "monthFirst";
  return cells.map((cell) => parseCalendarDate(cell, order) ?? null);
}

const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

const MILLISECONDS_IN_A_DAY = 86_400_000;
