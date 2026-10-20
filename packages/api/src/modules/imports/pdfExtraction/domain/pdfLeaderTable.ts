import type { PdfPage } from "../../../../utils";
import type { PdfCandidate } from "./pdfCandidates";
import { isDirectlyBelow, joinWrapped, pageLines, type Cell } from "./pdfLines";
import { knownColumnMapping } from "./layoutSheet";

/** Reads people and their positions from tables whose columns are joined by dot leaders. */
export function pdfLeaderTable(pages: PdfPage[]): PdfCandidate | null {
  const lines = pageLines(pages);
  const rows: string[][] = [];

  for (const page of pages.keys()) {
    const pageLinesForPage = lines.filter((line) => line.page === page);
    const header = pageLinesForPage.find(
      ({ cells }) =>
        cells.some(({ text }) => /\bName of Incumbent\b/iu.test(text)) &&
        cells.some(({ text }) => /\bPosition Title\b/iu.test(text)),
    );
    if (!header) continue;

    const nameColumn = header.cells.find(({ text }) => /\bName of Incumbent\b/iu.test(text))!;
    const titleColumn = header.cells.find(({ text }) => /\bPosition Title\b/iu.test(text))!;
    const data = pageLinesForPage.slice(pageLinesForPage.indexOf(header) + 1);
    for (let index = 0; index < data.length; index += 1) {
      const line = data[index]!;
      if (!line.cells.some(({ text }) => /\.{2,}/u.test(text))) continue;
      const fields = line.cells.flatMap(segments);
      const name = nearest(fields, nameColumn.x, nameColumn.tolerance, isIncumbent);
      const title = nearest(fields, titleColumn.x, titleColumn.tolerance, isPosition);
      if (!name || !title || name === title) continue;

      let jobTitle = title.text;
      while (index + 1 < data.length) {
        const below = data[index + 1]!;
        const hasIncumbent = below.cells
          .flatMap(segments)
          .some(
            ({ x, text }) =>
              Math.abs(x - nameColumn.x) <= Math.max(nameColumn.tolerance * 10, 80) &&
              isIncumbent(text),
          );
        const continuation = continuationFor(below.cells, title, titleColumn);
        if (
          !(
            isDirectlyBelow(below, line.y) || line.y - below.y <= below.cells[0]!.tolerance * 2.5
          ) ||
          below.page !== line.page ||
          hasIncumbent ||
          !continuation
        )
          break;
        jobTitle = joinWrapped(jobTitle, continuation.text);
        index += 1;
      }

      if (!/^vacant$/iu.test(name.text)) rows.push([name.text, jobTitle]);
    }
  }

  return rows.length === 0
    ? null
    : {
        id: "leaderTable",

        sheets: [
          {
            name: null,
            rows: [["Name", "Job title"], ...rows],
            knownMapping: knownColumnMapping({ fullName: 0, jobTitle: 1 }),
          },
        ],
      };
}

function segments(cell: Cell): Cell[] {
  const source = cell.text.replace(/^\.{2,}|\.{2,}$/gu, "");
  const parts: { text: string; at: number }[] = [];
  let start = 0;
  for (const match of source.matchAll(/\.{2,}/gu)) {
    const text = source.slice(start, match.index).trim();
    if (text) parts.push({ text, at: start + source.slice(start, match.index).indexOf(text) });
    start = match.index + match[0].length;
  }
  const tail = source.slice(start).trim();
  if (tail) parts.push({ text: tail, at: start + source.slice(start).indexOf(tail) });
  const widthPerCharacter = (cell.end - cell.x) / Math.max(cell.text.length, 1);
  return parts.map(({ text, at }) => ({
    text,
    x: cell.x + at * widthPerCharacter,
    end: cell.x + (at + text.length) * widthPerCharacter,
    tolerance: cell.tolerance,
  }));
}

function nearest(
  fields: Cell[],
  x: number,
  tolerance: number,
  accepts: (text: string) => boolean,
): Cell | undefined {
  return fields
    .filter(({ text }) => accepts(text))
    .toSorted((first, second) => Math.abs(first.x - x) - Math.abs(second.x - x))
    .find(({ x: fieldX }) => Math.abs(fieldX - x) <= Math.max(tolerance * 10, 80));
}

function continuationFor(cells: Cell[], title: Cell, column: Cell): Cell | undefined {
  return cells
    .flatMap(segments)
    .filter(({ text }) => isPosition(text) && !isSectionHeading(text))
    .toSorted((first, second) => Math.abs(first.x - title.x) - Math.abs(second.x - title.x))
    .find(
      ({ x }) =>
        Math.abs(x - column.x) <= Math.max(column.tolerance * 10, 80) &&
        Math.abs(x - title.x) <= Math.max(title.tolerance * 3, 16),
    );
}

function isSectionHeading(text: string): boolean {
  return /\p{L}/u.test(text) && text === text.toLocaleUpperCase();
}

function isIncumbent(text: string): boolean {
  return /^(?:Vacant|[\p{L}][\p{L}'’., -]*)$/u.test(text) && /\p{L}{2}/u.test(text);
}

function isPosition(text: string): boolean {
  return /\p{L}/u.test(text);
}
