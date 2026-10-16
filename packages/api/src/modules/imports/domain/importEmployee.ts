import { z } from "zod";

import { type CalendarDate, parseCalendarDate } from "../../../utils";

/** The version of the employee `values` schema that new records are written with. */
export const IMPORT_EMPLOYEE_VERSION = 1;

/** An employee as one source proposes it; any field may be missing until review. */
export interface ImportEmployeeValues {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  jobTitle: string | null;
  startDate: CalendarDate | null;
}

/** An employee record of the import: not yet an employee. */
export interface ImportEmployeeRecord extends ImportEmployeeValues {
  id: string;
  sourceId: string;
}

/** A record as a source delivers it, before it is stored. */
export interface IncomingRecord {
  /** The record's id in its source, such as a Slack user id. */
  externalId: string;
  /** The source's values as they came. */
  raw: unknown;
  values: ImportEmployeeValues;
}

/** Stored `values` of an employee record, read with the schema of their version. */
export function parseImportEmployeeValues(
  typeVersion: number,
  json: unknown,
): ImportEmployeeValues {
  if (typeVersion !== IMPORT_EMPLOYEE_VERSION) {
    throw new Error(`Unknown version ${typeVersion} of import employee values`);
  }
  return employeeValuesV1.parse(json);
}

const text = z.string().nullable();

const employeeValuesV1 = z.object({
  firstName: text,
  lastName: text,
  email: text,
  jobTitle: text,
  startDate: z
    .string()
    .nullable()
    .transform((value, context) => {
      if (value === null) {
        return null;
      }
      const date = parseCalendarDate(value);
      if (!date) {
        context.addIssue({ code: "custom", message: "Not a calendar date" });
        return z.NEVER;
      }
      return date;
    }),
});
