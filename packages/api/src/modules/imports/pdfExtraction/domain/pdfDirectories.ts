import type { PdfPage } from "../../../../utils";
import type { PdfCandidate } from "./pdfCandidates";
import { pageLines } from "./pdfLines";
import { knownColumnMapping } from "./layoutSheet";

/** Repeated name anchors split parallel directories without using their first people as headings. */
export function pdfDirectories(pages: PdfPage[]): PdfCandidate[] {
  const lines = pageLines(pages);
  const candidates: PdfCandidate[] = [];
  const commaLines = lines.map(({ cells }, index) =>
    hasNearbyLocationHeadings(lines, index) ? [] : cells.filter(({ text }) => isCommaName(text)),
  );
  if (commaLines.filter((cells) => cells.length >= 2).length >= 2) {
    candidates.push({
      id: "parallelNames",

      sheets: [
        {
          name: null,
          knownMapping: knownColumnMapping({ fullName: 0 }),
          rows: [
            ["Name"],
            ...commaLines.flatMap((cells) =>
              cells.map(({ text }) => [text.replace(/\s+\((?:LiV|emeritus|retired)\)$/iu, "")]),
            ),
          ],
        },
      ],
    });
  }
  const titled = lines.flatMap((line, index) =>
    line.cells.flatMap((cell) => {
      if (!TITLE_NAME.test(cell.text)) return [];
      const above = lines[index - 1];
      if (!above || above.page !== line.page || above.y - line.y > cell.tolerance * 2)
        return [[cell.text.split(",")[0]!, ""]];
      const role =
        above.cells.length === 1 && line.cells.length === 1
          ? above.cells[0]
          : above.cells.find(({ x }) => Math.abs(x - cell.x) <= cell.tolerance);
      if (!role || TITLE_NAME.test(role.text) || /\d/u.test(role.text))
        return [[cell.text.split(",")[0]!, ""]];
      return [[cell.text.split(",")[0]!, role.text]];
    }),
  );
  if (titled.some((row) => row[1]))
    candidates.push({
      id: "roleAbove",

      sheets: [
        {
          name: null,
          rows: [["Name", "Job title"], ...titled],
          knownMapping: knownColumnMapping({ fullName: 0, jobTitle: 1 }),
        },
      ],
    });
  const hasBirthdays = lines.some(({ cells }) =>
    cells.some(({ text }) => /birthday|geburtstag/iu.test(text)),
  );
  if (hasBirthdays) {
    const birthdays = lines.flatMap(({ cells }) =>
      cells.flatMap(({ text }, index) =>
        MONTH_DAY.test(text) && index > 0
          ? [[cells[index - 1]!.text.replace(/\s+-\s+\p{Lu}{2,}$/u, ""), text]]
          : [],
      ),
    );
    if (birthdays.length > 0)
      candidates.push({
        id: "birthdays",

        sheets: [
          {
            name: null,
            rows: [["Name", "Birth date"], ...birthdays],
            knownMapping: knownColumnMapping({ fullName: 0 }),
          },
        ],
      });
  }
  return candidates;
}

function hasNearbyLocationHeadings(lines: ReturnType<typeof pageLines>, index: number): boolean {
  const line = lines[index]!;
  const maxGap = Math.max(...line.cells.map(({ tolerance }) => tolerance)) * 6;
  return lines.some(
    (above) =>
      above.page === line.page &&
      above.y > line.y &&
      above.y - line.y <= maxGap &&
      hasLocationHeadings(above.cells.map(({ text }) => text)),
  );
}

function hasLocationHeadings(headings: string[]): boolean {
  return (
    headings.some((heading) => /^(?:city|town|locality)$/iu.test(heading.trim())) &&
    headings.some((heading) => /^(?:state|province|region|country)$/iu.test(heading.trim()))
  );
}

const COMMA_NAME = /^[\p{L}\p{M} .’'-]{2,},\s*[\p{L}\p{M}][\p{L}\p{M} .’'()-]+$/u;
const TITLE_NAME = /^(?:(?:the\s+)?rev[’']?d?\.?\s+)?(?:mr|mrs|ms|miss|dr|prof)\.?\s+\p{L}/iu;
const MONTH_DAY =
  /^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}$/iu;

function isCommaName(text: string): boolean {
  if (!COMMA_NAME.test(text)) return false;
  const parts = text.split(",").map((part) => part.trim());
  return /\p{Ll}/u.test(text) || parts.some((part) => (part.match(/\p{L}/gu)?.length ?? 0) > 3);
}
