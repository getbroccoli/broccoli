import { isDeepStrictEqual } from "node:util";

import type { PdfPage } from "../../../../utils";
import { checkSheets, type ImportEmployeeValues, type SheetRefusal } from "../../domain";
import { columnFields, contextHint, isNameField } from "./candidateFields";
import { pdfCandidates, type PdfCandidate } from "./pdfCandidates";
import { dateOrderOf, normalizedRecord } from "./pdfNormalization";
import { pdfSheets } from "./pdfSheets";

/**
 * Every distinct layout the builders find, for each representation of the pages in turn: its
 * table first, then the other builders' layouts. A layout over the sheet limits refuses the PDF,
 * since leaving it out would drop its people.
 */
export function localCandidates(representations: PdfPage[][]): PdfCandidate[] | SheetRefusal {
  const candidates: PdfCandidate[] = [];
  for (const pages of representations) {
    const table = pdfSheets(pages);
    for (const candidate of [
      ...(table ? [{ id: "table", sheets: table }] : []),
      ...pdfCandidates(pages),
    ]) {
      const checked = checkSheets(candidate.sheets);
      if (checked === "empty") continue;
      if (typeof checked === "string") return checked;
      if (!candidates.some(({ sheets }) => isDeepStrictEqual(sheets, candidate.sheets))) {
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

/**
 * Drops a layout only when another keeps every one of its person occurrences and populated fields
 * and adds people or fields; layouts that disagree are both kept.
 */
export function prunedCandidates(candidates: PdfCandidate[]): PdfCandidate[] {
  const records = candidates.map(candidateRecords);
  return candidates.filter(
    (_candidate, index) =>
      records[index]!.length === 0 ||
      !records.some(
        (other, otherIndex) => otherIndex !== index && dominates(other, records[index]!),
      ),
  );
}

/**
 * By populated email, job title and start date per person, then by people; layouts without people
 * last. Equal layouts keep their order. The order is only a cue for the model.
 */
export function rankedCandidates(candidates: PdfCandidate[]): PdfCandidate[] {
  const coverage = new Map(candidates.map((candidate) => [candidate, coverageOf(candidate)]));
  return candidates.toSorted((a, b) => {
    const [aFields, aPeople] = coverage.get(a)!;
    const [bFields, bPeople] = coverage.get(b)!;
    return bFields - aFields || bPeople - aPeople;
  });
}

function coverageOf(candidate: PdfCandidate): [number, number] {
  const records = candidateRecords(candidate);
  if (records.length === 0) return [-1, 0];
  const attributes = records.reduce(
    (count, { email, jobTitle, startDate }) =>
      count + [email, jobTitle, startDate].filter(Boolean).length,
    0,
  );
  return [attributes / records.length, records.length];
}

/** Each person row of the layout as normalized values, contact rows left out. */
function candidateRecords(candidate: PdfCandidate): ImportEmployeeValues[] {
  return candidate.sheets.flatMap((sheet) => {
    const fields = columnFields(sheet);
    if (sheet.rows.length === 0 || ![...fields.values()].some(isNameField)) return [];
    return sheet.rows.slice(1).flatMap((cells) => {
      const isContact = [...fields].some(
        ([column, field]) =>
          field === "other" && contextHint(cells[column] ?? "") === "excluded_contact_heading",
      );
      if (isContact) return [];
      const value = (wanted: string) =>
        [...fields]
          .filter(([column, field]) => field === wanted && cells[column]?.trim())
          .map(([column]) => cells[column]!.trim())
          .join(" ") || null;
      const name = value("fullName");
      const [firstName, lastName] = [value("firstName"), value("lastName")];
      if (!name && !firstName && !lastName) return [];
      const startDate = value("startDate");
      return [
        normalizedRecord({
          name,
          firstName,
          lastName,
          email: value("email"),
          jobTitle: value("jobTitle"),
          startDate,
          nameSource: name ? "combined" : "separate",
          dateOrder: dateOrderOf(startDate),
        }),
      ];
    });
  });
}

/**
 * Whether `stronger` keeps every person of `weaker` with each of their populated values, and adds
 * a person or a value.
 */
function dominates(stronger: ImportEmployeeValues[], weaker: ImportEmployeeValues[]): boolean {
  if (weaker.length === 0 || stronger.length < weaker.length) return false;
  const available = [...stronger];
  let improved = stronger.length > weaker.length;
  const fullestFirst = weaker.toSorted((a, b) => populated(b) - populated(a));
  for (const record of fullestFirst) {
    const match = available.findIndex(
      (candidate) =>
        candidate.firstName === record.firstName &&
        candidate.lastName === record.lastName &&
        FIELDS.every((field) => record[field] === null || candidate[field] === record[field]),
    );
    if (match < 0) return false;
    const [candidate] = available.splice(match, 1);
    improved ||= FIELDS.some((field) => record[field] === null && candidate![field] !== null);
  }
  return improved;
}

const FIELDS = ["firstName", "lastName", "email", "jobTitle", "startDate"] as const;

function populated(record: ImportEmployeeValues): number {
  return FIELDS.filter((field) => record[field] !== null).length;
}
