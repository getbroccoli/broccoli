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

/**
 * A column of dates: ISO, or d/m/yyyy or m/d/yyyy with `/`, `.` or `-`. The order is
 * read from the whole column; when no cell tells, only ISO dates are read.
 */
export function parseDateColumn(cells: readonly string[]): (CalendarDate | null)[] {
  const parts = cells.map((cell) => NUMERIC_DATE.exec(cell));
  // Only a date that exists in exactly one order tells the order; impossible dates tell nothing.
  const tells = (order: DateOrder) =>
    parts.some((match) => match && toDate(match, order) && !toDate(match, otherOrder(order)));
  const dayFirst = tells("dayFirst");
  const order = dayFirst === tells("monthFirst") ? null : dayFirst ? "dayFirst" : "monthFirst";
  return cells.map((cell, index) => {
    const match = parts[index];
    if (!match) {
      return parseCalendarDate(cell) ?? null;
    }
    return order === null ? null : toDate(match, order);
  });
}

const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

type DateOrder = "dayFirst" | "monthFirst";

function otherOrder(order: DateOrder): DateOrder {
  return order === "dayFirst" ? "monthFirst" : "dayFirst";
}

function toDate([, first, second, year]: RegExpExecArray, order: DateOrder): CalendarDate | null {
  const [day, month] = order === "dayFirst" ? [first!, second!] : [second!, first!];
  return parseCalendarDate(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`) ?? null;
}
