import { strFromU8, Unzip, UnzipInflate } from "fflate";
import readXlsxFile from "read-excel-file/node";

/** A visible sheet's rows of strings. */
export interface XlsxSheet {
  name: string;
  rows: string[][];
}

/** Why a workbook is not read. */
export type XlsxRefusal = "unreadable" | "too_many_rows" | "too_many_columns";

/** The furthest a cell holding content may sit. */
export interface XlsxLimits {
  maxRows: number;
  maxColumns: number;
}

/**
 * The visible sheets of an Excel workbook that hold any value, in workbook order. Formulas are
 * never evaluated: a cell reads the value its application saved. Dates read `yyyy-mm-dd`;
 * cells are trimmed and rows without any value dropped.
 */
export async function parseXlsx(
  bytes: Uint8Array,
  limits: XlsxLimits,
): Promise<XlsxSheet[] | XlsxRefusal> {
  const parts = unpackBounded(bytes);
  if (parts === null || parts.workbook === null) {
    return "unreadable";
  }
  const hidden = hiddenSheetPositions(parts.workbook);
  for (const worksheet of parts.worksheets) {
    const refusal = findFarCell(worksheet, limits);
    if (refusal !== null) {
      return refusal;
    }
  }
  let sheets: Awaited<ReturnType<typeof readXlsxFile>>;
  try {
    sheets = await readXlsxFile(Buffer.from(bytes));
  } catch {
    return "unreadable";
  }
  return sheets
    .filter((_, position) => !hidden.has(position))
    .map(({ sheet, data }) => ({ name: sheet, rows: readRows(data) }))
    .filter(({ rows }) => rows.length > 0);
}

/** Bounds unpacking, since a few megabytes of ZIP can expand to gigabytes. */
const MAX_UNPACKED_BYTES = 64 * 1024 * 1024;
const WORKSHEET = /^xl\/worksheets\/[^/]+\.xml$/;

interface WorkbookParts {
  workbook: string | null;
  worksheets: string[];
}

/** The workbook and worksheet XML, or null when the ZIP is broken or unpacks too large. */
function unpackBounded(bytes: Uint8Array): WorkbookParts | null {
  const chunksByName = new Map<string, Uint8Array[]>();
  let unpackedBytes = 0;
  let failed = false;
  const unzip = new Unzip((file) => {
    const wanted = file.name === "xl/workbook.xml" || WORKSHEET.test(file.name);
    const chunks: Uint8Array[] = [];
    if (wanted) {
      chunksByName.set(file.name, chunks);
    }
    file.ondata = (error, chunk) => {
      unpackedBytes += chunk?.length ?? 0;
      if (error !== null || unpackedBytes > MAX_UNPACKED_BYTES) {
        failed = true;
        file.terminate();
        return;
      }
      if (wanted) {
        chunks.push(chunk);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    unzip.push(bytes, true);
  } catch {
    return null;
  }
  if (failed) {
    return null;
  }
  const text = (name: string) => strFromU8(concat(chunksByName.get(name) ?? []));
  return {
    workbook: chunksByName.has("xl/workbook.xml") ? text("xl/workbook.xml") : null,
    worksheets: [...chunksByName.keys()].filter((name) => WORKSHEET.test(name)).map(text),
  };
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

/** Positions, in workbook order, of the sheets marked hidden or very hidden. */
function hiddenSheetPositions(workbook: string): Set<number> {
  const hidden = new Set<number>();
  [...workbook.matchAll(SHEET)].forEach(([sheet], position) => {
    if (/\sstate\s*=\s*["'](hidden|veryHidden)["']/.test(sheet)) {
      hidden.add(position);
    }
  });
  return hidden;
}

const SHEET = /<(?:[\w.-]+:)?sheet\s[^>]*>/g;

/**
 * The reader pads every row up to the furthest cell holding content, so one value far out
 * makes a tiny file fill the memory; such a cell is refused before parsing. Self-closing
 * cells hold nothing, so real files' styled empty cells far down still pass.
 */
function findFarCell(worksheet: string, { maxRows, maxColumns }: XlsxLimits): XlsxRefusal | null {
  let currentRow = 0;
  for (const { index } of worksheet.matchAll(ROW_OR_CELL)) {
    TAG.lastIndex = index;
    const tag = TAG.exec(worksheet);
    const reference = tag && readReference(tag[2] ?? "");
    if (!tag || reference === null) {
      return "unreadable";
    }
    if (tag[1] === "row") {
      currentRow = reference?.row ?? currentRow + 1;
      continue;
    }
    if (tag[3] === "/") {
      continue;
    }
    if ((reference?.column ?? 0) > maxColumns) {
      return "too_many_columns";
    }
    if ((reference?.row ?? currentRow) > maxRows) {
      return "too_many_rows";
    }
  }
  return null;
}

/** Where a row or cell starts, with or without a namespace prefix. */
const ROW_OR_CELL = /<(?:[\w.-]+:)?(?:row|c)(?=[\s/>])/g;
/**
 * The whole start tag there: its name, attributes, and `/` when self-closing. Quoted values
 * are matched whole, so a `>` inside one cannot end the tag; any other shape is unreadable.
 */
const TAG = /<(?:[\w.-]+:)?(row|c)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
const ATTRIBUTE = /([\w.:-]+)\s*=\s*("[^"]*"|'[^']*')/g;

/** The tag's `r` position; undefined without one, null when it is not a reference. */
function readReference(attributes: string): Position | null | undefined {
  for (const [, name, quoted = ""] of attributes.matchAll(ATTRIBUTE)) {
    if (name === "r") {
      return parseReference(quoted.slice(1, -1));
    }
  }
  return undefined;
}

interface Position {
  row: number;
  column: number;
}

/** A row reference (`12`) or a cell reference (`AB12`), 1-based. */
function parseReference(reference: string): Position | null {
  const match = /^([A-Z]{0,3})(\d+)$/.exec(reference);
  if (match === null) {
    return null;
  }
  const [, letters = "", digits = ""] = match;
  const column = [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
  return { row: Number(digits), column };
}

function readRows(data: readonly (readonly unknown[])[]): string[][] {
  return data.map((row) => row.map(readCell)).filter((row) => row.some((cell) => cell !== ""));
}

/** As a spreadsheet application's CSV export would write it, but dates in ISO form. */
function readCell(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return typeof value === "string" ? value.trim() : "";
}
