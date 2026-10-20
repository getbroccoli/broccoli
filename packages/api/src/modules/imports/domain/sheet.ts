/** A file's rows of cells, as they came; rows may differ in length. */
export type Sheet = readonly (readonly string[])[];

/** A sheet of a file; a CSV has one, without a name. */
export interface FileSheet {
  name: string | null;
  rows: Sheet;
}

/** Why a file is not read. */
export type SheetRefusal =
  | "unsupported_file"
  | "scanned_pdf"
  | "encrypted_pdf"
  | "empty"
  | "too_many_rows"
  | "too_many_columns"
  | "too_many_sheets";

/** The sheets within Broccoli's limits: 10 sheets, 10,000 rows in all and 100 columns. */
export function checkSheets(sheets: FileSheet[]): FileSheet[] | SheetRefusal {
  if (sheets.every(({ rows }) => rows.length === 0)) {
    return "empty";
  }
  if (sheets.length > MAX_SHEETS) {
    return "too_many_sheets";
  }
  if (sheets.reduce((count, { rows }) => count + rows.length, 0) > MAX_ROWS) {
    return "too_many_rows";
  }
  if (sheets.some(({ rows }) => rows.some((row) => row.length > MAX_COLUMNS))) {
    return "too_many_columns";
  }
  return sheets;
}

/** Large enough for any company's staff list, small enough to map in one job. */
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 100;
/** Each sheet is mapped on its own, so this bounds the model calls of one file. */
const MAX_SHEETS = 10;
