import { z } from "zod";

import { type FieldError, invalidInput } from "../../../core/applicationError";
import { parseCalendarDate } from "../../../utils";
import { nonBlank, parseEmail } from "../helpers";
import type { ImportEmployeeValues, IncomingRecord } from "./importEmployee";
import { splitFullNames } from "./personValues";

/** The most people one file may give, as many as one source's records page holds. */
export const MAX_READ_PEOPLE = 10_000;

/**
 * The people an AI sends for a file it read in full: the one definition the external agent's
 * route, the model's answer format and the validation share.
 */
export const readPeopleSchema = z
  .object({
    people: z
      .array(
        z.strictObject({
          firstName: personValue("Given name, as the file writes it."),
          lastName: personValue("Family name."),
          fullName: personValue(
            "The whole name, when the file has no separate given and family names.",
          ),
          email: personValue("Work email address."),
          jobTitle: personValue("Job title or role."),
          startDate: personValue("First working day, as YYYY-MM-DD."),
        }),
      )
      .min(1)
      .max(MAX_READ_PEOPLE)
      .describe("Everyone the file lists, one entry per person, in the file's order."),
  })
  .describe(
    "The people of one staff file. Leave out what the file does not say; never invent a value.",
  );

/** The people as import records, and how many had no name or email. */
export interface ReadPeople {
  records: IncomingRecord[];
  skipped: number;
}

/**
 * The read people as import records; refused with INVALID_INPUT unless the body fits
 * `readPeopleSchema`. Errors name a position and a known key, never a value or an unknown key:
 * both came from the file.
 */
export function parseReadPeople(body: unknown): ReadPeople {
  const parsed = readPeopleSchema.safeParse(body);
  if (!parsed.success) {
    throw invalidInput(uniqueFieldErrors(parsed.error.issues.map(fieldErrorOf)));
  }
  const { people } = parsed.data;
  // A list of full names reads as `Family, Given` only when all of them do, as in a mapped column.
  const fullNames = splitFullNames(people.map(({ fullName }) => fullName ?? null));
  const records: IncomingRecord[] = [];
  people.forEach((person, index) => {
    const values: ImportEmployeeValues = {
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

type ReadPerson = z.infer<typeof readPeopleSchema>["people"][number];
type PersonName = Pick<ImportEmployeeValues, "firstName" | "lastName">;

/** An optional short text; Postgres stores no NUL character, so one would fail the write. */
function personValue(description: string) {
  return z
    .string()
    .max(200)
    .refine((value) => !value.includes("\u0000"))
    .describe(description)
    .optional();
}

/** The field error of one schema issue: the list, one person, or one value of a person. */
function fieldErrorOf({ code, path }: z.core.$ZodIssue): FieldError {
  const [, index, key] = path;
  if (index === undefined) {
    return { field: "people", code: code === "too_big" ? "too_many" : "required" };
  }
  if (key === undefined) {
    // Not a person as the AI may send one: nothing in it is named, since it came from the file.
    return { field: `people[${String(index)}]`, code: "unknown_field" };
  }
  return { field: `people[${String(index)}].${String(key)}`, code: "invalid" };
}

function uniqueFieldErrors(errors: FieldError[]): FieldError[] {
  const seen = new Set<string>();
  return errors.filter(({ field, code }) => {
    const key = `${field} ${code}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** Separate first and last names win over a full name, as in a mapped file. */
function nameOf(person: ReadPerson, fullName: PersonName): PersonName {
  const firstName = nonBlank(person.firstName);
  const lastName = nonBlank(person.lastName);
  return firstName || lastName ? { firstName, lastName } : fullName;
}
