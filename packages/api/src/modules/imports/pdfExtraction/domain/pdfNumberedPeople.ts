import type { PdfPage } from "../../../../utils";
import type { PdfCandidate } from "./pdfCandidates";
import { pageLines, type Cell } from "./pdfLines";
import { knownColumnMapping } from "./layoutSheet";

/** Personnel numbers delimit records even when each record has several numeric detail lines. */
export function pdfNumberedPeople(pages: PdfPage[]): PdfCandidate | null {
  const lines = pageLines(pages);
  const headerAt = lines.findIndex(({ cells }) =>
    cells.some(({ text }) => NUMBER_LABEL.test(text) && /\bname\b/iu.test(text)),
  );
  if (headerAt < 0) return null;
  const header = lines[headerAt]!.cells;
  const nameColumn = header.find(({ text }) => NUMBER_LABEL.test(text))!;
  const dateColumn = header.find(({ text }) => /eintritt|hire|start/iu.test(text));
  const genderColumn = header.find(({ text }) => /\b[MWF]\/[MWF]\b/u.test(text));
  const records = lines.slice(headerAt + 1).flatMap((line, index) => {
    const first = line.cells[0]!;
    const match = /^(\d+)\s+(\p{L}.*)$/u.exec(first.text);
    if (!match || Math.abs(first.x - nameColumn.x) > first.tolerance * 5) return [];
    let name = match[2]!;
    if (genderColumn && first.end > genderColumn.x) name = name.replace(/\s+[MWF]$/u, "");
    const next = lines[headerAt + index + 2];
    const continuation = next?.cells[0];
    const given =
      next?.page === line.page &&
      continuation &&
      line.y - next.y <= first.tolerance * 2 &&
      Math.abs(continuation.x - first.x) <= first.tolerance * 2 &&
      /^[\p{L}\p{M} .’'-]+$/u.test(continuation.text)
        ? continuation.text
        : "";
    return [
      { number: match[1]!, name, given, date: dateColumn ? dateAt(line.cells, dateColumn) : "" },
    ];
  });
  if (records.length === 0) return null;
  const commaDelimited = records.every(
    ({ name, given }) => !given && splitCommaName(name) !== null,
  );
  const stacked = !commaDelimited && records.some(({ given }) => given !== "");
  if (stacked && records.some(({ given }) => given === "")) return null;
  const rows = commaDelimited
    ? [
        ["Staff number", "Last name", "First name", ...(dateColumn ? ["Start date"] : [])],
        ...records.map(({ number, name, date }) => [
          number,
          ...splitCommaName(name)!,
          ...(dateColumn ? [date] : []),
        ]),
      ]
    : stacked
      ? [
          ["Staff number", "Last name", "First name"],
          ...records.map(({ number, name, given }) => [number, name, given]),
        ]
      : [
          ["Staff number", "Name", "Start date"],
          ...records.map(({ number, name, date }) => [number, name, date]),
        ];
  return {
    id: "numbered",
    sheets: [
      {
        name: null,
        rows,
        knownMapping: knownColumnMapping(
          commaDelimited
            ? { lastName: 1, firstName: 2, ...(dateColumn ? { startDate: 3 } : {}) }
            : stacked
              ? { lastName: 1, firstName: 2 }
              : { fullName: 1, ...(dateColumn ? { startDate: 2 } : {}) },
        ),
      },
    ],
  };
}

const NUMBER_LABEL =
  /\b(?:p[.-]?nr|pers(?:onal)?[ .-]*(?:nr|nummer)|(?:employee|staff)\s+(?:number|no\.?|id))\b/iu;

function dateAt(cells: Cell[], column: Cell): string {
  const text = cells.find(({ x }) => Math.abs(x - column.x) <= column.tolerance * 2)?.text ?? "";
  return /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\b/u.exec(text)?.[0] ?? "";
}

function splitCommaName(name: string): [lastName: string, firstName: string] | null {
  const comma = name.indexOf(",");
  const lastName = name.slice(0, comma).trim();
  return comma < 0 || !lastName || name.includes(",", comma + 1)
    ? null
    : [lastName, name.slice(comma + 1).trim()];
}
