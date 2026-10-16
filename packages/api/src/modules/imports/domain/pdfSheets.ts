import type { PdfPage } from "../../../utils";
import { fieldOf, readBlocks, repeatedLabel } from "./pdfBlocks";
import { type Cell, pageLines, texts } from "./pdfLines";
import type { FileSheet } from "./sheet";

/**
 * A PDF's staff tables as sheets, or, in a PDF without a table, its person blocks as one sheet;
 * null when neither is found, or when a line below the first header is none of a header, a row,
 * a total, a sub-heading, a running title or a page's band text: then part of the staff content
 * could not be read, and none of it is. A table starts at a line of two or more cells that the
 * next line's cells line up with. Text above the first one is dropped, and so is a one-cell
 * sub-heading above a later one. On each later page, the text above the first line of the table,
 * such as a running title or a repeated header, is dropped too. Tables with equal header texts
 * join into one sheet: one sheet has no name, several are "Table 1", "Table 2", …. A table beside
 * person blocks, a label repeated outside the page bands, is refused: the blocks would be left out.
 */
export function pdfSheets(pages: PdfPage[]): FileSheet[] | null {
  const read = readTables(pages);
  if (read === null) {
    return readBlocks(pages)?.sheets ?? null;
  }
  const bodyLabels = pageLines(pages)
    .filter(({ inBand }) => !inBand)
    .flatMap(({ cells }) => fieldOf(cells)?.label ?? []);
  if (!read.complete || repeatedLabel(bodyLabels) !== undefined) {
    return null;
  }
  const sheets = new Map<string, string[][]>();
  for (const { header, lines } of read.tables) {
    const headerRow = header.map(({ text }) => text);
    const key = JSON.stringify(headerRow);
    const rows = sheets.get(key) ?? [headerRow];
    const columns = header.map(({ x }) => x);
    rows.push(...lines.map((line) => rowOf(line, columns)));
    sheets.set(key, rows);
  }
  const named = sheets.size > 1;
  return [...sheets.values()].map((rows, index) => ({
    name: named ? `Table ${index + 1}` : null,
    rows,
  }));
}

/**
 * Whether a page is a scan or photo: it has images but no visible text, or images cover at least
 * 15% of it and its text gives no staff row below a table's header, and starts no person block, on
 * that page. A footer or a
 * title over a scan may line up with the columns, but it does not repeat a header. One such page
 * refuses the whole file.
 */
export function hasScannedPage(pages: PdfPage[]): boolean {
  const textPages = readTables(pages)?.textPages ?? readBlocks(pages)?.pages ?? [];
  return pages.some(
    ({ items, imageCoverage }, page) =>
      (imageCoverage > 0 && items.length === 0) ||
      (imageCoverage >= SCAN_COVERAGE && textPages[page] !== true),
  );
}

/** Less than a scan of a list: a logo, a signature, a stamp. */
const SCAN_COVERAGE = 0.15;

/**
 * A line that reads as a row of the table: two or more cells with words or numbers, each
 * starting at a header column. A title beside a page number, or dots over a scan, is not one.
 */
function isStaffRow(line: Cell[], header: Cell[]): boolean {
  return line.filter(({ text }) => /[\p{L}\p{N}]/u.test(text)).length >= 2 && linesUp(line, header);
}

/** Lines starting with one of these words in their first worded cell are totals, not people. */
const TOTAL_WORDS = /^(summe|gesamt|totals?|anzahl|subtotals?)\b/iu;

/** A total or subtotal: its first worded cell is a total word, or no cell has a letter. */
function isTotal(line: Cell[]): boolean {
  const worded = line.find(({ text }) => /\p{L}/u.test(text));
  return worded === undefined || TOTAL_WORDS.test(worded.text);
}

/**
 * Every cell starts at a column of the header, and none runs over the start of a column that has
 * no cell of its own in the line, as prose does.
 */
function isRow(line: Cell[], header: Cell[]): boolean {
  const isFilled = (x: number) => line.some((cell) => Math.abs(cell.x - x) <= cell.tolerance);
  return (
    linesUp(line, header) &&
    !line.some((cell) =>
      header.some(
        ({ x }) => x > cell.x + cell.tolerance && x < cell.end - cell.tolerance && !isFilled(x),
      ),
    )
  );
}

/** A table: its header and the lines below it that are its rows. */
interface Table {
  header: Cell[];
  lines: Cell[][];
}

/**
 * The tables in page order, which pages show a header with a staff row of its table below it, and
 * whether every line below the first header was read; null when no table is found.
 */
function readTables(
  pages: PdfPage[],
): { tables: Table[]; textPages: boolean[]; complete: boolean } | null {
  const lines = pageLines(pages);
  const runningTexts = repeatedOnPages(lines);
  const bandTexts = repeatedInBands(lines);
  let complete = true;
  const tables: Table[] = [];
  const textPages = pages.map(() => false);
  let table: Table = { header: [], lines: [] };
  /**
   * A later table starts only under a sub-heading of its own, a one-cell line that is not a
   * running title, or with the current table's header texts: rows whose columns moved look like
   * a header and a row.
   */
  const startsTable = (at: number) => {
    const cells = lines[at]?.cells ?? [];
    const above = lines[at - 1]?.cells ?? [];
    const isHeadedOrFirst =
      table.header.length === 0 ||
      (above.length === 1 && !runningTexts.has(above[0]!.text)) ||
      sameRow(texts(cells), texts(table.header));
    return (
      isHeader(cells, lines[at + 1]?.cells) && !linesUp(cells, table.header) && isHeadedOrFirst
    );
  };
  let headerPage = -1;
  let page = -1;
  let pageStarted = false;
  for (let index = 0; index < lines.length; index += 1) {
    const { cells } = lines[index]!;
    const next = lines[index + 1]?.cells;
    if (lines[index]!.page !== page) {
      page = lines[index]!.page;
      pageStarted = false;
      const repeated = repeatedHeaderAt(lines, index, table);
      if (repeated > index) {
        index = repeated - 1;
        continue;
      }
    }
    if (startsTable(index)) {
      table = { header: cells, lines: [] };
      tables.push(table);
      headerPage = page;
      pageStarted = true;
      continue;
    }
    const isRunningTitle = !pageStarted && !(cells.length >= 2 && linesUp(cells, table.header));
    const isSubHeading =
      cells.length === 1 &&
      next !== undefined &&
      (startsTable(index + 1) || isRepeatedHeader(next, table.header));
    if (isRunningTitle || isSubHeading) {
      continue;
    }
    pageStarted = true;
    if (isRepeatedHeader(cells, table.header)) {
      headerPage = page;
      continue;
    }
    const isBandText =
      lines[index]!.inBand &&
      (cells.length < 2 || bandTexts.has(withoutDigits(cells)) || !isRow(cells, table.header));
    if (isBandText || isTotal(cells)) {
      continue;
    }
    if (!isRow(cells, table.header)) {
      complete = false;
      continue;
    }
    table.lines.push(cells);
    if (headerPage === page && isStaffRow(cells, table.header)) {
      textPages[page] = true;
    }
  }
  return tables.length > 0 ? { tables, textPages, complete } : null;
}

/** Band lines found on more than one page once their digits are dropped: "Seite 2 von 3". */
function repeatedInBands(lines: { cells: Cell[]; page: number; inBand: boolean }[]): Set<string> {
  const pagesOf = new Map<string, Set<number>>();
  for (const { cells, page } of lines.filter(({ inBand }) => inBand)) {
    const text = withoutDigits(cells);
    pagesOf.set(text, (pagesOf.get(text) ?? new Set()).add(page));
  }
  return new Set([...pagesOf].filter(([, pages]) => pages.size > 1).map(([text]) => text));
}

function withoutDigits(line: Cell[]): string {
  return JSON.stringify(texts(line)).replace(/\d/gu, "");
}

/**
 * Where the page that starts at `start` repeats the table's header with only running titles
 * above it: when it is the page's first line of the table, or it lies in the page's top quarter.
 * -1 otherwise: a header repeated mid-page under people keeps them.
 */
function repeatedHeaderAt(
  lines: { cells: Cell[]; page: number; inTopQuarter: boolean }[],
  start: number,
  table: Table,
): number {
  const page = lines[start]!.page;
  const onPage = lines.slice(start).filter((line) => line.page === page);
  const at = onPage.findIndex(({ cells }) => isRepeatedHeader(cells, table.header));
  const firstOfTable = onPage.findIndex(
    ({ cells }) => cells.length >= 2 && linesUp(cells, table.header),
  );
  return at >= 0 && (at === firstOfTable || onPage[at]!.inTopQuarter) ? start + at : -1;
}

/** Texts of one-cell lines found on more than one page: running titles, not sub-headings. */
function repeatedOnPages(lines: { cells: Cell[]; page: number }[]): Set<string> {
  const pagesOf = new Map<string, Set<number>>();
  for (const { cells, page } of lines.filter(({ cells }) => cells.length === 1)) {
    pagesOf.set(cells[0]!.text, (pagesOf.get(cells[0]!.text) ?? new Set()).add(page));
  }
  return new Set([...pagesOf].filter(([, pages]) => pages.size > 1).map(([text]) => text));
}

/**
 * Two or more cells that the next line's two or more cells line up with, unless both are a label
 * and its value: a person block's lines in label and value columns.
 */
function isHeader(line: Cell[], next: Cell[] | undefined): boolean {
  return (
    line.length >= 2 &&
    next !== undefined &&
    next.length >= 2 &&
    linesUp(next, line) &&
    !(fieldOf(line) !== null && fieldOf(next) !== null)
  );
}

function isRepeatedHeader(line: Cell[], header: Cell[]): boolean {
  const columns = header.map(({ x }) => x);
  return sameRow(
    rowOf(line, columns),
    header.map(({ text }) => text),
  );
}

/** Each cell starts where one of the header's cells starts. */
function linesUp(line: Cell[], header: Cell[]): boolean {
  return line.every((cell) => header.some(({ x }) => Math.abs(x - cell.x) <= cell.tolerance));
}

/** The line's values by column: a cell belongs to the last column starting at or left of it. */
function rowOf(line: Cell[], columns: number[]): string[] {
  const row = columns.map(() => "");
  for (const cell of line) {
    const column = Math.max(
      0,
      columns.findLastIndex((x) => x <= cell.x + cell.tolerance),
    );
    row[column] = row[column] ? `${row[column]} ${cell.text}` : cell.text;
  }
  return row;
}

function sameRow(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
