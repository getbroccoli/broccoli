import type { PdfPage, PdfTextItem } from "../../../utils";

/** A page's top and bottom share where running headers, footers and page numbers sit. */
const BAND = 0.1;

/**
 * Every page's lines in reading order, with where each sits on its page. A cell wrapped onto the
 * lines below it is joined into one: see `withWrappedCells`.
 */
export function pageLines(
  pages: PdfPage[],
): { cells: Cell[]; y: number; page: number; inTopQuarter: boolean; inBand: boolean }[] {
  return pages.flatMap(({ items, height }, page) =>
    withWrappedCells(linesOf(items)).map(({ cells, y }) => ({
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

/** Joins two pieces of one wrapped text: a word broken after its hyphen joins without a space. */
export function joinWrapped(first: string, second: string): string {
  return first.endsWith("-") ? `${first}${second}` : `${first} ${second}`;
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

/**
 * The lines with each cell wrapped onto the next line joined to it. A line continues the one above
 * when it lies directly below it, each of its cells starts where a cell above starts, and it has
 * at most half as many cells as the page's widest line so far, its header or a full row: the rest
 * of a few values, not the next row.
 */
function withWrappedCells(lines: { cells: Cell[]; y: number }[]): { cells: Cell[]; y: number }[] {
  const joined: { cells: Cell[]; y: number }[] = [];
  let lastY = Number.NaN;
  let widest = 0;
  for (const line of lines) {
    const above = joined.at(-1);
    const wrapped = above && continues(line, above.cells, lastY, widest);
    lastY = line.y;
    if (!wrapped) {
      joined.push({ cells: line.cells.map((cell) => ({ ...cell })), y: line.y });
      widest = Math.max(widest, line.cells.length);
      continue;
    }
    for (const cell of line.cells) {
      const target = above.cells.find(({ x }) => Math.abs(x - cell.x) <= cell.tolerance)!;
      target.text = joinWrapped(target.text, cell.text);
      target.end = Math.max(target.end, cell.end);
    }
  }
  return joined;
}

/** `lastY` is the baseline of the line right above, which may itself be wrapped text. */
function continues(
  line: { cells: Cell[]; y: number },
  above: Cell[],
  lastY: number,
  widest: number,
): boolean {
  return (
    isDirectlyBelow(line, lastY) &&
    line.cells.length <= widest / 2 &&
    line.cells.every((cell) => above.some(({ x }) => Math.abs(x - cell.x) <= cell.tolerance))
  );
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
