import { parseDateColumn, type PdfPage } from "../../../../utils";
import { isDirectlyBelow, pageLines } from "./pdfLines";
import type { PdfCandidate } from "./pdfCandidates";
import { knownColumnMapping } from "./layoutSheet";

/** Locally reconstructs labeled personnel forms and repeated mailing-label blocks. */
export function pdfForms(pages: PdfPage[]): PdfCandidate[] {
  return [personnelForm(pages), mailingLabels(pages)].filter(
    (candidate): candidate is PdfCandidate => candidate !== null,
  );
}

function personnelForm(pages: PdfPage[]): PdfCandidate | null {
  const lines = pageLines(pages);
  const records: string[][] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const employeeNumber = field(lines[index]!.cells, EMPLOYEE_NUMBER);
    if (!employeeNumber) continue;
    const record = [employeeNumber, "", "", "", "", ""];
    const dates: string[] = [];
    const name = adjacentName(lines[index]!.cells, EMPLOYEE_NUMBER);
    if (name) [record[1], record[2]] = name;
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next]!;
      if (line.page !== lines[index]!.page || field(line.cells, EMPLOYEE_NUMBER)) break;
      if (line.cells.some(({ text }) => /^emergency contacts?\b/i.test(text))) break;
      record[1] ||= field(line.cells, FAMILY_NAME);
      record[2] ||= field(line.cells, GIVEN_NAME);
      record[3] ||= field(line.cells, JOB_TITLE);
      record[4] ||= field(line.cells, EMAIL);
      record[5] ||= field(line.cells, HIRE_DATE);
      dates.push(field(line.cells, DATE_FIELD));
    }
    // Other labeled dates in this form can establish the hire date's day/month order.
    record[5] = parseDateColumn([record[5]!, ...dates])[0] ?? record[5]!;
    if (record[1] || record[2]) records.push(record);
  }
  return records.length === 0
    ? null
    : {
        id: "personnel-forms",

        sheets: [
          {
            name: null,
            knownMapping: knownColumnMapping({
              lastName: 1,
              firstName: 2,
              jobTitle: 3,
              email: 4,
              startDate: 5,
            }),
            rows: [
              ["Employee number", "Last name", "First name", "Job title", "Email", "Hire date"],
              ...records,
            ],
          },
        ],
      };
}

function mailingLabels(pages: PdfPage[]): PdfCandidate | null {
  const lines = pageLines(pages);
  const people = lines.flatMap((line, index) =>
    line.cells.flatMap((cell) => {
      if (!looksLikeName(cell.text)) return [];
      const address: string[] = [];
      let previous = line;
      for (const below of lines.slice(index + 1)) {
        if (below.page !== line.page || below.y >= previous.y) break;
        const nextCell = below.cells.find(({ x }) => Math.abs(x - cell.x) <= cell.tolerance * 2);
        if (!nextCell || !isDirectlyBelow(below, previous.y) || looksLikeName(nextCell.text)) break;
        address.push(nextCell.text);
        previous = below;
        if (address.length === 4) break;
      }
      return /^\d+\s+(?:\d+\p{L}+|\p{L})/u.test(address[0] ?? "")
        ? [[cell.text, address.join(", ")]]
        : [];
    }),
  );
  return people.length < 2
    ? null
    : {
        id: "mailing-labels",

        sheets: [
          {
            name: null,
            rows: [["Name", "Mailing address"], ...people],
            knownMapping: knownColumnMapping({ fullName: 0 }),
          },
        ],
      };
}

function field(cells: { text: string }[], label: RegExp): string {
  for (let index = 0; index < cells.length; index += 1) {
    const match = label.exec(cells[index]!.text);
    if (match) {
      const next = cells[index + 1]?.text ?? "";
      return (match[1] || (/^[\p{L} -]+\s*:/u.test(next) ? "" : next)).trim();
    }
  }
  return "";
}

function adjacentName(cells: { text: string }[], label: RegExp): [string, string] | null {
  const labelIndex = cells.findIndex(({ text }) => label.test(text));
  const value = label.exec(cells[labelIndex]?.text ?? "")?.[1]?.trim();
  const name = [value, ...cells.slice(labelIndex + 1).map(({ text }) => text)].find((text) =>
    text?.includes(","),
  );
  if (!name) return null;
  const [family, given] = name.split(",", 2).map((part) => part.trim());
  return family && given ? [family, given] : null;
}

function looksLikeName(text: string): boolean {
  const words = text.trim().split(/\s+/u);
  return (
    words.length >= 2 &&
    words.length <= 5 &&
    words.every((word) => /^[\p{L}'’-]+\.?$/u.test(word)) &&
    !/^(employee|mailing|emergency|contact|department|address)\b/i.test(text)
  );
}

const EMPLOYEE_NUMBER =
  /^(?:employee\s*(?:number|no\.?|id)|personnel\s*(?:number|no\.?|id))\s*:\s*(.*)$/iu;
const FAMILY_NAME = /^(?:last|family|surname)\s*name\s*:\s*(.*)$/iu;
const GIVEN_NAME = /^(?:first|given)\s*name\s*:\s*(.*)$/iu;
const JOB_TITLE = /^(?:job\s*title|position)\s*:\s*(.*)$/iu;
const EMAIL = /^(?:e[- ]?mail|email\s*address)\s*:\s*(.*)$/iu;
const HIRE_DATE = /^(?:hire|start|employment)\s*date\s*:\s*(.*)$/iu;
const DATE_FIELD =
  /^(?:birth|hire|start|employment|review|inactive|termination|rehire)\s*date\s*:\s*(.*)$/iu;
