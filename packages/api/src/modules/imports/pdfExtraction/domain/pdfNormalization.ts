import { type CalendarDate, parseCalendarDate } from "../../../../utils";
import type { ImportEmployeeValues } from "../../domain";
import { wordHint } from "./wordHint";

/** How a date is written: day first, month first or year first. */
export type DateOrder = "dmy" | "mdy" | "ymd";

/** The values a PDF record restores, each from source words or cells. */
export const SOURCE_FIELDS = [
  "name",
  "firstName",
  "lastName",
  "email",
  "jobTitle",
  "startDate",
] as const;

export type SourceField = (typeof SOURCE_FIELDS)[number];

export function isSourceField(value: string): value is SourceField {
  return (SOURCE_FIELDS as readonly string[]).includes(value);
}

/** A person's values as the PDF prints them, before normalization. */
export interface SourceRecord {
  /** A whole name printed in one cell or line. */
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  jobTitle: string | null;
  startDate: string | null;
  /** Whether the name was printed whole (`name`) or in given and family columns. */
  nameSource: "combined" | "separate";
  dateOrder: DateOrder | null;
}

/**
 * A restored record as import values. PDF names keep their case unless printed all in capitals;
 * titles, ranks and credentials are dropped; only a complete email and a date with a four-digit
 * year in a known order are kept.
 */
export function normalizedRecord(source: SourceRecord): ImportEmployeeValues {
  const [firstName, lastName] =
    source.nameSource === "separate"
      ? [literalName(source.firstName), literalName(source.lastName)]
      : splitName(literalName(source.name));
  const email = clean(source.email);
  const jobTitle = clean(source.jobTitle);
  return {
    firstName,
    lastName,
    email: email !== null && EMAIL.test(email) ? email.toLowerCase() : null,
    jobTitle:
      jobTitle !== null && !STAND_IN_LABELS.has(jobTitle.toLowerCase())
        ? jobTitle.replace(/[ .,;:]+$/u, "")
        : null,
    startDate: parseDate(source.startDate, source.dateOrder),
  };
}

/** The order a date is written in, when its shape shows one. */
export function dateOrderOf(value: string | null): DateOrder | null {
  if (!value) return null;
  const hint = wordHint(value);
  return DATE_ORDERS.find((order) => hint.startsWith(`date_${order}`)) ?? null;
}

const DATE_ORDERS: DateOrder[] = ["dmy", "mdy", "ymd"];

/** A complete address: something, an at sign, a domain with a dot. */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/** Office labels printed where a role would be; not a job title. */
const STAND_IN_LABELS = new Set(["vertretung", "vorzimmer", "geschäftszimmer"]);

/** Spaces collapsed; null for nothing. */
function clean(value: string | null): string | null {
  return value?.split(/\s+/u).filter(Boolean).join(" ") || null;
}

/** A name as printed, without an emeritus note or trailing credentials; all capitals title-cased. */
function literalName(value: string | null): string | null {
  let name = clean(value);
  if (name === null) return null;
  name = name
    .replace(/\s*\((?:emeritus|emerita|liv)\)/giu, "")
    .replace(/,\s*(?:BA|MA|BSc|MSc|PhD|MBA|BEd|MEd|PGCE)\b.*$/u, "")
    .replace(/[ ,]+$/u, "");
  if (isUpperCase(name)) {
    return name
      .split(" ")
      .map((word) => (word.replace(/[^\p{L}\p{N}_]/gu, "").length > 1 ? titleCase(word) : word))
      .join(" ");
  }
  return name;
}

/**
 * A whole name as given and family name: `Stone, Avery` surname first; trailing initials are the
 * given name; otherwise the last word with its particles is the family name.
 */
function splitName(name: string | null): [string | null, string | null] {
  if (!name) return [null, null];
  if ([...name].filter((character) => character === ",").length === 1) {
    const [family = "", given = ""] = name.split(",");
    return [withoutTitles(clean(given)), clean(family)];
  }
  const words = (withoutTitles(name) ?? "").split(" ").filter(Boolean);
  if (words.length < 2) return [clean(words.join(" ")), null];
  let trailing = words.length;
  while (trailing > 0 && INITIAL.test(words[trailing - 1]!)) trailing--;
  if (trailing > 0 && trailing < words.length) {
    return [words.slice(trailing).join(" "), words.slice(0, trailing).join(" ")];
  }
  let start = words.length - 1;
  while (start > 0 && PARTICLES.has(words[start - 1]!.toLowerCase())) start--;
  if (start === 0) start = words.length - 1;
  return [words.slice(0, start).join(" "), words.slice(start).join(" ")];
}

/** The name without leading titles and ranks, such as `The Rev'd Dr`, when a name follows. */
function withoutTitles(value: string | null): string | null {
  if (!value) return null;
  const words = value.split(/\s+/u).filter(Boolean);
  if (words.length > 1 && words[0]!.toLowerCase() === "the" && /^rev/iu.test(words[1]!)) {
    words.shift();
  }
  while (words.length > 1 && TITLE.test(words[0]!)) words.shift();
  return clean(words.join(" "));
}

const TITLE =
  /^(?:mr|mrs|ms|miss|mx|dr|prof|herr|frau|rev['’]?d?|MR|LMR|RR|AR|RI|RD|RBe|RBr|MDgt|LPD)(?:in)?\.?$/iu;
/** A lone letter, with or without a dot. */
const INITIAL = /^\p{L}\.?$/u;
/** Lowercase surname particles, as in van der Meer. */
const PARTICLES = new Set(["van", "von", "der", "den", "de", "del", "da", "di", "la", "le", "du"]);

function isUpperCase(value: string): boolean {
  return value === value.toUpperCase() && value !== value.toLowerCase();
}

/** Python's `str.title()` for one word: each letter run starts upper case. */
function titleCase(word: string): string {
  return word
    .toLowerCase()
    .replace(
      /(^|[^\p{L}])(\p{L})/gu,
      (_match, before: string, letter: string) => before + letter.toUpperCase(),
    );
}

/** An ISO date, or a four-digit-year date in a known day-month order; else null. */
function parseDate(raw: string | null, order: DateOrder | null): CalendarDate | null {
  const value = clean(raw);
  if (value === null) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u.exec(value);
  if (iso) {
    const [, year, month, day] = iso;
    return parseCalendarDate(`${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`) ?? null;
  }
  if (order !== "dmy" && order !== "mdy") return null;
  return parseCalendarDate(value, order === "dmy" ? "dayFirst" : "monthFirst") ?? null;
}
