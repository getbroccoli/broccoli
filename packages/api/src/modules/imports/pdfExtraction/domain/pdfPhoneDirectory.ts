import { keptByPlaceholders } from "../../../../integrations/ai";
import type { PdfPage } from "../../../../utils";
import type { PdfCandidate } from "./pdfCandidates";
import { isDirectlyBelow, pageLines, type Cell } from "./pdfLines";
import { knownColumnMapping } from "./layoutSheet";

/** Repeated phone anchors locate the name column, including people whose phone is blank. */
export function pdfPhoneDirectory(pages: PdfPage[]): PdfCandidate | null {
  const lines = pageLines(pages);
  const anchors = lines.flatMap((line, index) =>
    line.cells.flatMap((cell, column) => {
      if (!PHONE.test(cell.text)) return [];
      const left = line.cells[column - 1];
      const name =
        nameAbove(lines, index, cell) ??
        (left && nameText(left.text) ? { cell: left, lineIndex: index } : null);
      return name ? [{ ...name, page: line.page, y: line.y, phone: cell.text }] : [];
    }),
  );
  if (anchors.length < 2) return null;
  let columns: Cell[] = [];
  const rows = pages.flatMap((_, page) => {
    const pageAnchors = anchors.filter((anchor) => anchor.page === page);
    if (pageAnchors.length > 0) columns = pageAnchors.map(({ cell }) => cell);
    const anchorYs = pageAnchors.map(({ y }) => y);
    const padding = Math.max(...pageAnchors.map(({ cell }) => cell.tolerance), 0) * 6;
    const topAnchorY = Math.max(...anchorYs);
    const bottomAnchorY = Math.min(...anchorYs);
    const people = lines.flatMap((line, index) =>
      line.page !== page ||
      (anchorYs.length > 0 && (line.y > topAnchorY + padding || line.y < bottomAnchorY - padding))
        ? []
        : line.cells.flatMap((cell, column) => {
            const name = columns.some((anchor) => sameColumn(cell, anchor))
              ? nameAt(lines, index, cell)
              : null;
            if (!name) return [];
            const role = line.cells[column - 1];
            const sameLineRole =
              role && !columns.some((anchor) => sameColumn(role, anchor))
                ? /^(?:Vorzimmer|office|department)$/iu.test(role.text)
                  ? ""
                  : roleAt(lines, index, role, columns)
                : "";
            const phone = anchors.find(
              (anchor) => anchor.lineIndex === index && anchor.cell.x === cell.x,
            )?.phone;
            return [[name, sameLineRole || roleAbove(lines, index, cell) || "", phone ?? ""]];
          }),
    );
    if (people.length === 0) columns = [];
    return people;
  });
  return rows.length < 2
    ? null
    : {
        id: "phoneDirectory",

        sheets: [
          {
            name: null,
            rows: [["Name", "Job title", "Phone"], ...rows],
            knownMapping: knownColumnMapping({ fullName: 0, jobTitle: 1 }),
          },
        ],
      };
}

const PHONE =
  /^(?:(?:tel(?:ephone|efon)?\.?|phone)\s*:?\s*[+()\d /-]{3,}(?:\s*\|\s*[^|]+)?|\d{2,}[-/]\d{2,})$/iu;

function nameText(text: string): boolean {
  text = text.replace(/\s+\([^)]*\)$/u, "");
  return (
    !/[\d:]/u.test(text) &&
    /\p{L}+\.?\s+\p{L}/u.test(text) &&
    !/\b(?:office|department|unit|division|center|centre|administration)$/iu.test(text) &&
    !keptByPlaceholders(text)
  );
}

function nameAt(lines: ReturnType<typeof pageLines>, index: number, cell: Cell): string | null {
  let name = cell.text.replace(/\s+\(zugl\.[^)]*\)$/iu, "");
  const next = lines[index + 1];
  const continuation = next?.cells.find(
    (candidate) => Math.abs(candidate.x - cell.x) <= cell.tolerance * 3,
  );
  if (
    name.endsWith("-") &&
    next?.page === lines[index]!.page &&
    continuation &&
    isDirectlyBelow(next, lines[index]!.y) &&
    /^[\p{L}\p{M}'’.-]+$/u.test(continuation.text)
  ) {
    name += continuation.text;
  }
  return nameText(name) ? name : null;
}

function nameAbove(
  lines: ReturnType<typeof pageLines>,
  index: number,
  phone: Cell,
): { cell: Cell; lineIndex: number } | undefined {
  const line = lines[index]!;
  const above = lines[index - 1];
  if (!above || above.page !== line.page || !isDirectlyBelow(line, above.y)) return undefined;
  const name = above.cells.find(
    (candidate) => Math.abs(candidate.x - phone.x) <= phone.tolerance * 3,
  );
  if (!name) return undefined;
  if (nameText(name.text)) return { cell: name, lineIndex: index - 1 };

  const previous = lines[index - 2];
  const prefix = previous?.cells.find(
    (candidate) => Math.abs(candidate.x - phone.x) <= phone.tolerance * 3,
  );
  if (
    previous?.page !== line.page ||
    !isDirectlyBelow(above, previous.y) ||
    !prefix?.text.endsWith("-")
  )
    return undefined;
  const text = `${prefix.text}${name.text}`;
  return nameText(text) ? { cell: { ...prefix, text }, lineIndex: index - 2 } : undefined;
}

function roleAt(
  lines: ReturnType<typeof pageLines>,
  index: number,
  cell: Cell,
  nameColumns: Cell[],
): string {
  let role = cell.text;
  let previous = lines[index]!;
  for (const next of lines.slice(index + 1)) {
    if (next.page !== previous.page || previous.y - next.y > cell.tolerance * 2.5) break;
    const continuation = next.cells.find(
      (candidate) => Math.abs(candidate.x - cell.x) <= cell.tolerance * 2,
    );
    if (
      !continuation ||
      PHONE.test(continuation.text) ||
      /\d/u.test(continuation.text) ||
      nameColumns.some((column) => sameColumn(continuation, column)) ||
      next.cells.some(
        (candidate) =>
          nameColumns.some((column) => sameColumn(candidate, column)) && nameText(candidate.text),
      )
    )
      break;
    role = `${role} ${continuation.text}`;
    previous = next;
  }
  return role;
}

function roleAbove(
  lines: ReturnType<typeof pageLines>,
  index: number,
  name: Cell,
): string | undefined {
  const line = lines[index]!;
  const above = lines[index - 1];
  const phoneIndex = index + (name.text.endsWith("-") ? 2 : 1);
  const below = lines[phoneIndex];
  if (
    !above ||
    above.page !== line.page ||
    below?.page !== line.page ||
    !below.cells.some(
      (cell) => PHONE.test(cell.text) && nameAbove(lines, phoneIndex, cell)?.cell.x === name.x,
    ) ||
    above.y - line.y >
      Math.max(name.tolerance, ...above.cells.map(({ tolerance }) => tolerance)) * 2.5
  )
    return undefined;

  const nameCells = line.cells.filter((candidate) => nameText(candidate.text));
  const nameCenter = center(name);
  const pairedCenters = nameCells
    .filter((candidate) => candidate !== name)
    .map((candidate) => center(candidate));
  const role = above.cells
    .filter((candidate) => !PHONE.test(candidate.text) && !/[\d:]/u.test(candidate.text))
    .find((candidate) => {
      if (/^(?:Herr|Frau)\b/iu.test(candidate.text)) return false;
      const roleCenter = center(candidate);
      return (
        Math.abs(roleCenter - nameCenter) <= name.tolerance * 2 ||
        pairedCenters.some(
          (otherCenter) =>
            Math.abs(roleCenter - (nameCenter + otherCenter) / 2) <= name.tolerance * 2,
        )
      );
    });

  return role?.text;
}

function center(cell: Cell): number {
  return (cell.x + cell.end) / 2;
}

function sameColumn(cell: Cell, anchor: Cell): boolean {
  return Math.abs(cell.x - anchor.x) <= cell.tolerance;
}
