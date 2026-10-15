import { parseCsv } from "../../../utils";

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

/** Large enough for any company's staff list, small enough to map in one job. */
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 100;
