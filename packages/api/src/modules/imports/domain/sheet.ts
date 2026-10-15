import { type CalendarDate, parseCalendarDate, parseCsv } from "../../../utils";

/** A file's rows of cells, as they came; rows may differ in length. */
export type Sheet = readonly (readonly string[])[];

/** Why a file is not read. */
export type SheetRefusal = "not_csv" | "empty" | "too_many_rows" | "too_many_columns";

/** The file's rows; refused over 10,000 rows or 100 columns. */
export function readSheet(bytes: Uint8Array): Sheet | SheetRefusal {
  const rows = parseCsv(bytes);
  if (rows === null) {
    return "not_csv";
  }
  if (rows.length === 0) {
    return "empty";
  }
  if (rows.length > MAX_ROWS) {
    return "too_many_rows";
  }
  if (rows.some((row) => row.length > MAX_COLUMNS)) {
    return "too_many_columns";
  }
  return rows;
}

/**
 * A start date column: ISO, or d/m/yyyy or m/d/yyyy with `/`, `.` or `-`. The order is
 * read from the whole column; when no cell tells, only ISO dates are read.
 */
export function readDateColumn(cells: readonly string[]): (CalendarDate | null)[] {
  const parts = cells.map((cell) => NUMERIC_DATE.exec(cell));
  const dayFirst = parts.some((match) => match !== null && Number(match[1]) > 12);
  const monthFirst = parts.some((match) => match !== null && Number(match[2]) > 12);
  const order = dayFirst === monthFirst ? null : dayFirst ? "dayFirst" : "monthFirst";
  return cells.map((cell, index) => {
    const match = parts[index];
    if (!match) {
      return parseCalendarDate(cell) ?? null;
    }
    if (order === null) {
      return null;
    }
    const [, first, second, year] = match;
    const [day, month] = order === "dayFirst" ? [first!, second!] : [second!, first!];
    return parseCalendarDate(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`) ?? null;
  });
}

/** Large enough for any company's staff list, small enough to map in one job. */
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 100;

const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
