import type { PdfPage, PdfTextItem } from "../../../utils";
import type { FileSheet } from "./sheet";

/**
 * A PDF's staff tables as sheets; null when no table is found. A table starts at a line of two or
 * more cells that the next line's cells line up with. Text above the first one is dropped, and so
 * is a one-cell sub-heading above a later one. On each later page, the text above the first line
 * of the table, such as a running title or a repeated header, is dropped too. Tables with equal
 * header texts join into one sheet: one sheet has no name, several are "Table 1", "Table 2", ….
 */
export function pdfSheets(pages: PdfPage[]): FileSheet[] | null {
  const read = readTables(pages);
  if (read === null) {
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
 * 15% of it and its text gives no staff row below a table's header on that page. A footer or a
 * title over a scan may line up with the columns, but it does not repeat a header. One such page
 * refuses the whole file.
 */
export function hasScannedPage(pages: PdfPage[]): boolean {
  const textPages = readTables(pages)?.textPages ?? [];
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

/** A table: its header and the lines below it that are its rows. */
interface Table {
  header: Cell[];
  lines: Cell[][];
}

/**
 * The tables in page order, and which pages show a header with a staff row of its table below
 * it; null when no table is found.
 */
function readTables(pages: PdfPage[]): { tables: Table[]; textPages: boolean[] } | null {
  const lines = pages.flatMap(({ items }, page) =>
    linesOf(items).map((cells) => ({ cells, page })),
  );
  const tables: Table[] = [];
  const textPages = pages.map(() => false);
  let table: Table = { header: [], lines: [] };
  let headerPage = -1;
  let page = -1;
  let pageStarted = false;
  for (let index = 0; index < lines.length; index += 1) {
    const { cells } = lines[index]!;
    const next = lines[index + 1]?.cells;
    if (lines[index]!.page !== page) {
      page = lines[index]!.page;
      pageStarted = false;
      // Text above the page's repeated header is a running title, unless a sub-heading sits
      // directly above that header: then the lines above are rows of the table before it.
      // shortcut: rows directly above an equal header with no sub-heading are dropped; upgrade
      // when a report repeats its header mid-page without a heading.
      const repeated = lines.findIndex(
        (line, at) =>
          at >= index && line.page === page && isRepeatedHeader(line.cells, table.header),
      );
      if (repeated > index && lines[repeated - 1]!.cells.length > 1) {
        index = repeated - 1;
        continue;
      }
    }
    if (isNewTable(cells, next, table)) {
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
      (isNewTable(next, lines[index + 2]?.cells, table) || isRepeatedHeader(next, table.header));
    if (isRunningTitle || isSubHeading) {
      continue;
    }
    pageStarted = true;
    if (isRepeatedHeader(cells, table.header)) {
      headerPage = page;
      continue;
    }
    table.lines.push(cells);
    if (headerPage === page && isStaffRow(cells, table.header)) {
      textPages[page] = true;
    }
  }
  return tables.length > 0 ? { tables, textPages } : null;
}

/** Two or more cells that the next line's two or more cells line up with. */
function isHeader(line: Cell[], next: Cell[] | undefined): boolean {
  return line.length >= 2 && next !== undefined && next.length >= 2 && linesUp(next, line);
}

/**
 * A header that is not the current table's. After the first table, a line with an email or a
 * number is a row whose columns moved, not a header.
 */
function isNewTable(line: Cell[], next: Cell[] | undefined, table: Table): boolean {
  const isFirst = table.header.length === 0;
  return (
    isHeader(line, next) &&
    !linesUp(line, table.header) &&
    (isFirst || !line.some(({ text }) => /[@\p{N}]/u.test(text)))
  );
}

function isRepeatedHeader(line: Cell[], header: Cell[]): boolean {
  const columns = header.map(({ x }) => x);
  return sameRow(
    rowOf(line, columns),
    header.map(({ text }) => text),
  );
}

/** Text that reads as one piece: items on one baseline, each the next word of the one before. */
interface Cell {
  text: string;
  x: number;
  /** How far a neighbour may be and still count as close: the text's height. */
  tolerance: number;
}

/** A page's lines, top to bottom, each its cells left to right. */
function linesOf(items: PdfTextItem[]): Cell[][] {
  const lines: PdfTextItem[][] = [];
  for (const item of items.toSorted((a, b) => b.y - a.y)) {
    const line = lines.at(-1);
    if (line && Math.abs(line[0]!.y - item.y) <= item.height / 2) {
      line.push(item);
    } else {
      lines.push([item]);
    }
  }
  return lines.map(cellsOf);
}

function cellsOf(line: PdfTextItem[]): Cell[] {
  const cells: (Cell & { end: number })[] = [];
  for (const item of line.toSorted((a, b) => a.x - b.x)) {
    const cell = cells.at(-1);
    if (cell && isNextWord(item.x - cell.end, item.height)) {
      cell.text = `${cell.text} ${item.text.trim()}`;
      cell.end = item.x + item.width;
    } else {
      cells.push({
        text: item.text.trim(),
        x: item.x,
        tolerance: item.height,
        end: item.x + item.width,
      });
    }
  }
  return cells.map(({ text, x, tolerance }) => ({ text, x, tolerance }));
}

/**
 * Close enough to be the next word of the same text. A run that starts well inside the previous
 * one is the next column's text, drawn over a value too long for its column.
 */
function isNextWord(gap: number, height: number): boolean {
  return gap > -1 && gap < height;
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
