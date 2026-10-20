import { casefold } from "./casefold";
import type { LayoutSheet } from "./layoutSheet";

/** What a candidate column holds; `other` is anything that is not imported. */
export type CandidateField =
  "fullName" | "firstName" | "lastName" | "email" | "jobTitle" | "startDate" | "other";

/** A section label that says whose details follow. */
export type ContextHint = "excluded_contact_heading" | "employee_section_heading";

/**
 * Each column's field: a builder's known columns, else read from the header row, where explicit
 * given and family names win over a generic name column. A blank header over names becomes the
 * name column when the sheet has an email and a role or date.
 */
export function columnFields(sheet: LayoutSheet): Map<number, CandidateField> {
  const fields = sheet.knownMapping
    ? knownFields(sheet.knownMapping)
    : headerFields(sheet.rows[0] ?? []);
  return withBlankNameColumn(sheet.rows, fields);
}

export function isNameField(field: CandidateField): boolean {
  return field === "fullName" || field === "firstName" || field === "lastName";
}

/** Whether a value labels a company or emergency contact, or the employee's own section. */
export function contextHint(value: string): ContextHint | null {
  const plain = casefold(value)
    .replace(/[^\p{L}\p{N}_\s]+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean)
    .join(" ");
  if (EXCLUDED_CONTACT_LABELS.has(plain)) return "excluded_contact_heading";
  if (EMPLOYEE_SECTION_LABELS.has(plain)) return "employee_section_heading";
  return null;
}

const EXCLUDED_CONTACT_LABELS = new Set([
  "emergency contact",
  "next of kin",
  "notfallkontakt",
  "notfall kontakt",
  "contacto de emergencia",
  "company contact",
  "company information",
]);
const EMPLOYEE_SECTION_LABELS = new Set([
  "employee information",
  "employee record",
  "personal information",
  "staff information",
  "employee details",
]);

function knownFields(
  mapping: NonNullable<LayoutSheet["knownMapping"]>,
): Map<number, CandidateField> {
  return new Map(
    Object.entries(mapping).flatMap(([field, column]) =>
      column === null ? [] : [[column, field as CandidateField]],
    ),
  );
}

function headerFields(header: readonly string[]): Map<number, CandidateField> {
  const fields = header.map(headerField);
  const hasSplitName = fields.some((field) => field === "firstName" || field === "lastName");
  return new Map(
    fields.map((field, column) => [column, hasSplitName && field === "fullName" ? "other" : field]),
  );
}

function headerField(value: string): CandidateField {
  if (value.includes("#") || /\b(?:id|identifier|num[eé]ro)\b/iu.test(value)) return "other";
  const text = casefold(value).replace(/[^\p{L}\p{N}_]+/gu, "");
  const has = (parts: string[]) => parts.some((part) => text.includes(part));
  if (has(NOT_IMPORTED)) return "other";
  if (has(["email", "mail", "correo"])) return "email";
  if (has(["firstname", "givenname", "forename", "vorname", "prénom"])) return "firstName";
  if (has(["lastname", "surname", "familyname", "familienname", "nachname", "apellido"])) {
    return "lastName";
  }
  if (has(["jobtitle", "position", "role", "cargo", "puesto", "tätigkeit", "funktion", "beruf"])) {
    return "jobTitle";
  }
  if (has(["hire", "startdate", "entrydate", "employmentstart", "eintritt", "joining", "alta"])) {
    return "startDate";
  }
  if (text === "start") return "startDate";
  return NAME_HEADERS.has(text) ? "fullName" : "other";
}

/** Header words of numbers and details that are never imported, such as a birth date. */
const NOT_IMPORTED = [
  "number",
  "nummer",
  "headcount",
  "birth",
  "geburt",
  "salary",
  "budget",
  "phone",
  "telephone",
  "telefon",
  "office",
  "room",
];
const NAME_HEADERS = new Set([
  "name",
  "names",
  "fullname",
  "employee",
  "employeename",
  "faculty",
  "staff",
  "nombre",
  "nombres",
  "nom",
]);

/**
 * The one blank header column, as the name column, when it holds only name-shaped values and the
 * sheet has an email and a role or start date but no name column.
 */
function withBlankNameColumn(
  rows: LayoutSheet["rows"],
  fields: Map<number, CandidateField>,
): Map<number, CandidateField> {
  const mapped = [...fields.values()];
  if (mapped.some(isNameField)) return fields;
  if (
    !mapped.includes("email") ||
    !mapped.some((field) => field === "jobTitle" || field === "startDate")
  ) {
    return fields;
  }
  const blanks = (rows[0] ?? []).flatMap((value, index) => (value.trim() === "" ? [index] : []));
  if (blanks.length !== 1) return fields;
  const column = blanks[0]!;
  const values = rows
    .slice(1)
    .map((row) => row[column]?.trim() ?? "")
    .filter(Boolean);
  const nameShaped = (value: string) =>
    /^\p{L}[\p{L}\p{N}_ .,'’-]+$/u.test(value) && !/\p{N}/u.test(value) && !contextHint(value);
  return values.length > 0 && values.every(nameShaped)
    ? new Map([...fields, [column, "fullName"]])
    : fields;
}
