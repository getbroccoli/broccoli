import type { PdfPage } from "../../../../utils";
import type { PdfCandidate } from "./pdfCandidates";
import { joinWrapped, pageLines, type Cell } from "./pdfLines";
import { knownColumnMapping } from "./layoutSheet";

/** Reads each person band independently; unkeyed contact sections cannot be joined to people. */
export function pdfColumnBands(pages: PdfPage[]): PdfCandidate | null {
  const rows = pages.flatMap((page) => {
    const lines = pageLines([page]);
    const labels = lines.flatMap(({ cells }) => (cells.length === 1 ? [cells[0]!.text] : []));
    const repeated = [...new Set(labels.filter((label, i) => labels.indexOf(label) !== i))];
    return repeated.flatMap((label) => {
      const starts = lines.flatMap(({ cells }, index) =>
        cells.length === 1 && cells[0]!.text === label ? [index] : [],
      );
      return starts.flatMap((start, i) => {
        const band = readBand(lines.slice(start + 1, starts[i + 1]));
        if (!band) return [];
        const headers = band.header.map(({ text }) => text);
        const family = headers.findIndex((text) => FIRST_SURNAME.test(text));
        const second = headers.findIndex((text) => SECOND_SURNAME.test(text));
        if (family < 0 || second < 0) return [];
        headers[family] = "Last name";
        const columns = FIELDS.map((field) =>
          headers.findIndex(
            (text) => (LABELS.find(([label]) => label.test(text))?.[1] ?? text) === field,
          ),
        );
        // shortcut: unkeyed contact bands stay separate; join only when a shared record key is available.
        return band.rows.map((row) =>
          columns.map((column) =>
            column === family
              ? [row[family], row[second]].filter(Boolean).join(" ")
              : (row[column] ?? ""),
          ),
        );
      });
    });
  });
  return rows.length === 0
    ? null
    : {
        id: "columnBands",
        sheets: [
          {
            name: null,
            rows: [FIELDS, ...rows],
            knownMapping: knownColumnMapping({
              firstName: 0,
              lastName: 1,
              jobTitle: 2,
              email: 3,
              startDate: 4,
            }),
          },
        ],
      };
}

const FIELDS = ["First name", "Last name", "Job title", "Work email", "Start date"];
const FIRST_SURNAME = /^(?:primer apellido|first surname)\b/iu;
const SECOND_SURNAME = /^(?:segundo apellido|second surname)\b/iu;
const LABELS: [RegExp, string][] = [
  [/^Nombre(?: del servidor\(a\) público\(a\))?$/iu, "First name"],
  [/^Denominación del cargo$/iu, "Job title"],
  [/^Fecha de alta en el cargo$/iu, "Start date"],
  [/^Correo electrónico oficial\b/iu, "Work email"],
];

function readBand(
  lines: { cells: Cell[]; y: number }[],
): { header: Cell[]; rows: string[][] } | null {
  if (lines.length < 3) return null;
  const header: Cell[] = [];
  let end = 0;
  do {
    for (const cell of lines[end]!.cells) {
      const column = header.find(
        (column) => Math.abs(center(cell) - center(column)) <= cell.tolerance,
      );
      if (column) {
        column.text = joinWrapped(column.text, cell.text);
      } else {
        header.push({ ...cell });
      }
    }
    end += 1;
  } while (
    lines[end] &&
    lines[end - 1]!.y - lines[end]!.y <= lines[end]!.cells[0]!.tolerance * 1.5
  );
  header.sort((a, b) => center(a) - center(b));
  if (header.length < 2 || lines.length - end < 2) return null;
  const rows: string[][] = [];
  for (const { cells } of lines.slice(end)) {
    const row = header.map(() => "");
    for (const cell of cells) {
      const column = header.findIndex(
        (column) => Math.abs(center(cell) - center(column)) <= cell.tolerance,
      );
      if (column < 0 || row[column]) return null;
      row[column] = cell.text;
    }
    rows.push(row);
  }
  const spacing = lines[end]!.y - lines[end + 1]!.y;
  if (
    lines
      .slice(end + 1)
      .some(
        (line, i) => Math.abs(lines[end + i]!.y - line.y - spacing) > line.cells[0]!.tolerance / 2,
      )
  )
    return null;
  return { header, rows };
}

function center(cell: Cell): number {
  return (cell.x + cell.end) / 2;
}
