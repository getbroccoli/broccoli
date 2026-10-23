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
  let best: { rows: string[][]; regularRows: number; outerLength: number } | null = null;
  for (const delimiter of DELIMITERS) {
    const rows = parseWith(text, delimiter);
    if (rows === null) {
      continue;
    }
    const { regularRows, outerLength } = tableRegularity(rows);
    // shortcut: ambiguous CSVs use structural inference; add delimiter choice if real inputs remain indistinguishable.
    if (
      best === null ||
      regularRows > best.regularRows ||
      (regularRows === best.regularRows && outerLength < best.outerLength)
    ) {
      best = { rows, regularRows, outerLength };
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

/** Shorter outer cells favour separators surrounding punctuation inside the table. */
function tableRegularity(rows: string[][]): { regularRows: number; outerLength: number } {
  const rowsByWidth = new Map<number, { count: number; outerLength: number }>();
  for (const row of rows) {
    const group = rowsByWidth.get(row.length) ?? { count: 0, outerLength: 0 };
    group.count += 1;
    group.outerLength += row[0]!.length + row.at(-1)!.length;
    rowsByWidth.set(row.length, group);
  }
  let regularRows = 0;
  let outerLength = Infinity;
  for (const [width, group] of rowsByWidth) {
    // A one-column parse is regular too, so it only wins when no delimiter splits the rows.
    if (
      width > 1 &&
      (group.count > regularRows ||
        (group.count === regularRows && group.outerLength < outerLength))
    ) {
      regularRows = group.count;
      outerLength = group.outerLength;
    }
  }
  return { regularRows, outerLength };
}
