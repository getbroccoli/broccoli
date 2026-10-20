import { type FieldError, invalidInput } from "../../../core/applicationError";
import { parseCalendarDate } from "../../../utils";
import type { IncomingRecord } from "./importEmployee";
import { nonBlank, parseEmail, splitFullNames } from "./personValues";

/** The people the external agent read from a file, as records, and how many had no name or email. */
export interface ParsedPeople {
  records: IncomingRecord[];
  skipped: number;
}

/** The most people one file may send, as many as one source's records page holds. */
export const MAX_PARSED_PEOPLE = 10_000;

/**
 * The external agent's people as import records; refused with INVALID_INPUT unless it is an array
 * of at most `MAX_PARSED_PEOPLE` objects holding only the known keys, each a short string. Errors
 * name the position and a known key, never a value or an unknown key: both came from the file.
 */
export function parseParsedPeople(people: unknown): ParsedPeople {
  if (!Array.isArray(people) || people.length === 0) {
    throw invalidInput([{ field: "people", code: "required" }]);
  }
  if (people.length > MAX_PARSED_PEOPLE) {
    throw invalidInput([{ field: "people", code: "too_many" }]);
  }
  const errors = people.flatMap((person, index) => personErrors(person, `people[${index}]`));
  if (errors.length > 0) {
    throw invalidInput(errors);
  }
  const parsed = people as ParsedPerson[];
  // A list of full names reads as `Family, Given` only when all of them do, as in a mapped column.
  const fullNames = splitFullNames(parsed.map(({ fullName }) => fullName ?? null));
  const records: IncomingRecord[] = [];
  parsed.forEach((person, index) => {
    const values = {
      ...nameOf(person, fullNames[index]!),
      email: parseEmail(person.email),
      jobTitle: nonBlank(person.jobTitle),
      startDate: (person.startDate && parseCalendarDate(person.startDate.trim())) || null,
    };
    if (values.firstName !== null || values.lastName !== null || values.email !== null) {
      records.push({ externalId: `person:${index + 1}`, raw: person, values });
    }
  });
  return { records, skipped: people.length - records.length };
}

const PERSON_KEYS = [
  "firstName",
  "lastName",
  "fullName",
  "email",
  "jobTitle",
  "startDate",
] as const;
const MAX_VALUE_LENGTH = 200;

type ParsedPerson = Partial<Record<(typeof PERSON_KEYS)[number], string>>;

function personErrors(person: unknown, field: string): FieldError[] {
  if (
    typeof person !== "object" ||
    person === null ||
    Array.isArray(person) ||
    Object.keys(person).some((key) => !(PERSON_KEYS as readonly string[]).includes(key))
  ) {
    // Not a person as the agent may send one: nothing in it is named, since it came from the file.
    return [{ field, code: "unknown_field" }];
  }
  return PERSON_KEYS.filter((key) => {
    const value = (person as Record<string, unknown>)[key];
    // Postgres stores no NUL character, so one would fail the write and carry the batch's values.
    return (
      value !== undefined &&
      (typeof value !== "string" || value.length > MAX_VALUE_LENGTH || value.includes("\u0000"))
    );
  }).map((key) => ({ field: `${field}.${key}`, code: "invalid" }));
}

/** Separate first and last names win over a full name, as in a mapped file. */
function nameOf(person: ParsedPerson, fullName: PersonName): PersonName {
  const firstName = nonBlank(person.firstName);
  const lastName = nonBlank(person.lastName);
  return firstName || lastName ? { firstName, lastName } : fullName;
}

type PersonName = Pick<IncomingRecord["values"], "firstName" | "lastName">;
