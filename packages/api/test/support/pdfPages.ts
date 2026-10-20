import { parsePdf, type PdfPage, type PdfTextItem } from "../../src/utils";

/** Reads a synthetic PDF fixture, failing setup if the real reader refuses it. */
export async function readPdfPages(bytes: Uint8Array): Promise<PdfPage[]> {
  const pages = await parsePdf(bytes);
  if (!Array.isArray(pages)) throw new Error("The PDF fixture must be readable");
  return pages;
}

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
