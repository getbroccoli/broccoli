import type { PdfPage, PdfTextItem } from "../../../utils";
import type { FileSheet } from "./sheet";

/**
 * A PDF's staff table as one sheet without a name; null when no table is found. The table's
 * header is its first line of two or more cells that the next two lines line up with. Text above
 * it is dropped, and so is a header repeated on a later page with the text above it there.
 */
export function pdfSheets(pages: PdfPage[]): FileSheet[] | null {
  const pageLines = pages.map(({ items }) => linesOf(items));
  const start = findHeader(pageLines);
  if (start === null) {
    return null;
  }
  const header = pageLines[start.page]![start.line]!;
  const columns = header.map(({ x }) => x);
  const headerRow = header.map(({ text }) => text);
  const rows = pageLines.flatMap((lines, page) => {
    if (page < start.page) return [];
    const placed = lines.map((line) => rowOf(line, columns));
    const after =
      page === start.page ? start.line : placed.findIndex((row) => sameRow(row, headerRow));
    return placed.slice(after + 1);
  });
  return [{ name: null, rows: [headerRow, ...rows] }];
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

/** The first line of two or more cells whose next two lines, in page order, line up with it. */
function findHeader(pageLines: Cell[][][]): { page: number; line: number } | null {
  const lines = pageLines.flatMap((page, pageIndex) =>
    page.map((cells, lineIndex) => ({ cells, page: pageIndex, line: lineIndex })),
  );
  const header = lines.find(
    ({ cells }, index) =>
      cells.length >= 2 &&
      lines.slice(index + 1, index + 3).length === 2 &&
      lines.slice(index + 1, index + 3).every((next) => linesUp(next.cells, cells)),
  );
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
