import type { PdfPage, PdfTextItem } from "../../src/utils";

/** A US Letter page of the reader's output with the given lines and image coverage. */
export function page(lines: PdfTextItem[][], imageCoverage = 0): PdfPage {
  return { width: 612, height: 792, items: lines.flat(), imageCoverage };
}

/** A line of cells 160 pt apart from x = 40 + left; offset shifts every cell but the first. */
export function line(y: number, cells: string[], offset = 0, left = 0): PdfTextItem[] {
  return cells
    .map((text, index) => ({
      text,
      x: 40 + left + index * 160 + (index > 0 ? offset : 0),
      y,
      width: text.length * 5,
      height: 10,
    }))
    .filter(({ text }) => text !== "");
}
