import type { PdfPage, PdfTextItem } from "../../../utils";
import type { FileSheet } from "./sheet";

/**
 * A PDF's staff table as one sheet without a name; null when no table is found. The table's
 * header is its first line of two or more cells that the next line's cells line up with. Text above
 * it is dropped, and so is a header repeated on a later page with the text above it there.
 */
export function pdfSheets(pages: PdfPage[]): FileSheet[] | null {
  const table = readTable(pages);
  if (table === null) {
    return null;
  }
  const columns = table.header.map(({ x }) => x);
  const rows = table.pageLines.flat().map((line) => rowOf(line, columns));
  return [{ name: null, rows: [table.header.map(({ text }) => text), ...rows] }];
}

/**
 * Whether a page is a scan or photo: it has images but no visible text, or images cover at least
 * 15% of it and its text gives no staff row. One such page refuses the whole file.
 */
export function hasScannedPage(pages: PdfPage[]): boolean {
  const table = readTable(pages);
  const hasStaffRow = (page: number) =>
    table !== null && (table.pageLines[page] ?? []).some((line) => isStaffRow(line, table.header));
  return pages.some(
    ({ items, imageCoverage }, page) =>
      (imageCoverage > 0 && items.length === 0) ||
      (imageCoverage >= SCAN_COVERAGE && !hasStaffRow(page)),
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

/** The table's header and each page's lines below it; null when no table is found. */
function readTable(pages: PdfPage[]): { header: Cell[]; pageLines: Cell[][][] } | null {
  const pageLines = pages.map(({ items }) => linesOf(items));
  const start = findHeader(pageLines);
  if (start === null) {
    return null;
  }
  const header = pageLines[start.page]![start.line]!;
  const columns = header.map(({ x }) => x);
  const headerRow = header.map(({ text }) => text);
  const linesBelow = pageLines.map((lines, page) => {
    if (page < start.page) return [];
    const after =
      page === start.page
        ? start.line
        : lines.findIndex((line) => sameRow(rowOf(line, columns), headerRow));
    return lines.slice(after + 1);
  });
  return { header, pageLines: linesBelow };
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

/** The first line of two or more cells whose next line, in page order, has two or more that line up with it. */
function findHeader(pageLines: Cell[][][]): { page: number; line: number } | null {
  const lines = pageLines.flatMap((page, pageIndex) =>
    page.map((cells, lineIndex) => ({ cells, page: pageIndex, line: lineIndex })),
  );
  const header = lines.find(({ cells }, index) => {
    const next = lines[index + 1]?.cells ?? [];
    return cells.length >= 2 && next.length >= 2 && linesUp(next, cells);
  });
  return header ? { page: header.page, line: header.line } : null;
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
