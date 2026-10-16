import type { PdfPage, PdfTextItem } from "../../../utils";

/** A page's top and bottom share where running headers, footers and page numbers sit. */
const BAND = 0.1;

/** Every page's lines in reading order, with where each sits on its page. */
export function pageLines(
  pages: PdfPage[],
): { cells: Cell[]; page: number; inTopQuarter: boolean; inBand: boolean }[] {
  return pages.flatMap(({ items, height }, page) =>
    linesOf(items).map(({ cells, y }) => ({
      cells,
      page,
      inTopQuarter: y > height * 0.75,
      inBand: y > height * (1 - BAND) || y < height * BAND,
    })),
  );
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
