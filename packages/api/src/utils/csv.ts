import { parse } from "csv-parse/sync";

/**
 * The rows of a CSV file, with its delimiter and encoding worked out; null when the
 * bytes are not text or no delimiter reads them. Cells are trimmed and rows without
 * any value dropped.
 */
export function parseCsv(bytes: Uint8Array): string[][] | null {
  const text = decode(bytes);
  if (text.startsWith("%PDF-") || CONTROL_CHARACTER.test(text)) {
    return null;
  }
  let best: { rows: string[][]; regularRows: number; regularColumns: number } | null = null;
  for (const delimiter of DELIMITERS) {
    const rows = parseWith(text, delimiter);
    if (rows === null) {
      continue;
    }
    const { regularRows, regularColumns } = tableRegularity(rows);
    if (
      best === null ||
      regularRows > best.regularRows ||
      (regularRows === best.regularRows && regularColumns > best.regularColumns)
    ) {
      best = { rows, regularRows, regularColumns };
    }
  }
  return best?.rows ?? null;
}

const DELIMITERS = [",", ";", "\t"] as const;

/** Delimited text holds no control characters but tabs and line breaks. */
const CONTROL_CHARACTER = /[^\P{Cc}\t\n\r]/u;

/** UTF-8, the BOM dropped; text that is not valid UTF-8 is most likely an older Excel export. */
function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** The rows split at `delimiter`, or null when its quoting does not hold together. */
function parseWith(text: string, delimiter: string): string[][] | null {
  let rows: string[][];
  try {
    rows = parse(text, { delimiter, relax_column_count: true, relax_quotes: true, trim: true });
  } catch {
    return null;
  }
  // The parser trims around quotes; spaces inside them are trimmed here.
  return rows
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell !== ""));
}

/** Prefer the most regular table, then the wider one when punctuation makes another regular split. */
function tableRegularity(rows: string[][]): { regularRows: number; regularColumns: number } {
  const rowsByWidth = new Map<number, number>();
  for (const { length } of rows) {
    rowsByWidth.set(length, (rowsByWidth.get(length) ?? 0) + 1);
  }
  let regularRows = 0;
  let regularColumns = 0;
  for (const [width, count] of rowsByWidth) {
    // A one-column parse is regular too, so it only wins when no delimiter splits the rows.
    if (width > 1 && (count > regularRows || (count === regularRows && width > regularColumns))) {
      regularRows = count;
      regularColumns = width;
    }
  }
  return { regularRows, regularColumns };
}
