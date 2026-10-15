import { parse } from "csv-parse/sync";

/**
 * The rows of a CSV file, with its delimiter and encoding worked out; null when the
 * bytes are not text or no delimiter reads them. Cells are trimmed and rows without
 * any value dropped.
 */
export function parseCsv(bytes: Uint8Array): string[][] | null {
  if (bytes.includes(0)) {
    return null;
  }
  const text = decode(bytes);
  let best: { rows: string[][]; regularRows: number } | null = null;
  for (const delimiter of DELIMITERS) {
    const rows = parseWith(text, delimiter);
    if (rows === null) {
      continue;
    }
    const regularRows = countRegularRows(rows);
    if (best === null || regularRows > best.regularRows) {
      best = { rows, regularRows };
    }
  }
  return best?.rows ?? null;
}

const DELIMITERS = [",", ";", "\t"] as const;

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

/** How many rows share the most common column count: the right delimiter makes a regular table. */
function countRegularRows(rows: string[][]): number {
  const rowsByWidth = new Map<number, number>();
  for (const { length } of rows) {
    rowsByWidth.set(length, (rowsByWidth.get(length) ?? 0) + 1);
  }
  let regularRows = 0;
  for (const [width, count] of rowsByWidth) {
    // A one-column parse is regular too, so it only wins when no delimiter splits the rows.
    if (width > 1 && count > regularRows) {
      regularRows = count;
    }
  }
  return regularRows;
}
