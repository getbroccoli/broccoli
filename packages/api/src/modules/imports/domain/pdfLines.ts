import type { PdfPage, PdfTextItem } from "../../../utils";

/** Every page's lines in reading order, with where each sits on its page. */
export function pageLines(
  pages: PdfPage[],
): { cells: Cell[]; y: number; page: number; inTopQuarter: boolean; inBand: boolean }[] {
  return pages.flatMap(({ items, height }, page) =>
    linesOf(items).map(({ cells, y }) => ({
      cells,
      y,
      page,
      inTopQuarter: y > height * 0.75,
      inBand: y > height * (1 - BAND) || y < height * BAND,
    })),
  );
}

/** Whether `below` lies directly under the baseline `y`: wrapped text, not the next line of a list. */
export function isDirectlyBelow(below: { cells: Cell[]; y: number }, y: number): boolean {
  return y - below.y <= below.cells[0]!.tolerance * 1.5;
}

/**
 * A table line's cells with the lines wrapped below it joined in, and the index after them. A line
 * continues the one above when it lies directly below it on the same page, each of its cells
 * starts where a cell of the table line starts, it fills at most half of the table's `width`
 * columns and holds no email address or date: the rest of a few values, not the next row.
 */
export function withWrapped(
  lines: { cells: Cell[]; y: number; page: number }[],
  at: number,
  width: number,
): { cells: Cell[]; end: number } {
  const cells = lines[at]!.cells.map((cell) => ({ ...cell }));
  let end = at + 1;
  for (; end < lines.length; end += 1) {
    const line = lines[end]!;
    const above = lines[end - 1]!;
    const targets = line.cells.map((cell) =>
      cells.find(({ x }) => Math.abs(x - cell.x) <= cell.tolerance),
    );
    if (
      line.page !== above.page ||
      !isDirectlyBelow(line, above.y) ||
      line.cells.length > width / 2 ||
      targets.includes(undefined) ||
      line.cells.some(({ text }) => isEmail(text) || DATE.test(text))
    ) {
      break;
    }
    line.cells.forEach((cell, index) => {
      const target = targets[index]!;
      target.text = joinWrapped(target.text, cell.text);
      target.end = Math.max(target.end, cell.end);
    });
  }
  return { cells, end };
}

/** Joins two pieces of one wrapped text: a word broken after its hyphen joins without a space. */
export function joinWrapped(first: string, second: string): string {
  return first.endsWith("-") ? `${first}${second}` : `${first} ${second}`;
}

export function isEmail(text: string): boolean {
  return /^\S+@\S+\.\S+$/u.test(text);
}

export function texts(line: Cell[]): string[] {
  return line.map(({ text }) => text);
}

/** Text that reads as one piece: items on one baseline, each the next word of the one before. */
export interface Cell {
  text: string;
  x: number;
  end: number;
  /** How far a neighbour may be and still count as close: the text's height. */
  tolerance: number;
}

/** A page's top and bottom share where running headers, footers and page numbers sit. */
const BAND = 0.1;

/** A date as payroll exports print it: 01.01.2020, 2020-01-01, 1/14/2022. */
const DATE = /\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/u;

/** A page's lines, top to bottom, each its cells left to right and its baseline. */
function linesOf(items: PdfTextItem[]): { cells: Cell[]; y: number }[] {
  const lines: PdfTextItem[][] = [];
  for (const item of items.toSorted((a, b) => b.y - a.y)) {
    const line = lines.at(-1);
    if (line && Math.abs(line[0]!.y - item.y) <= item.height / 2) {
      line.push(item);
    } else {
      lines.push([item]);
    }
  }
  return lines.map((line) => ({ cells: cellsOf(line), y: line[0]!.y }));
}

function cellsOf(line: PdfTextItem[]): Cell[] {
  const cells: Cell[] = [];
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
  return cells;
}

/**
 * Close enough to be the next word of the same text. A run that starts well inside the previous
 * one is the next column's text, drawn over a value too long for its column.
 */
function isNextWord(gap: number, height: number): boolean {
  return gap > -1 && gap < height;
}
