import { z } from "zod";

import { parseCalendarDate } from "../../../utils";
import type { ImportEmployeeChoices, ImportEmployeeRecord, ImportEmployeeValues } from "../domain";
import type { importRecords } from "./importRecordsTable";

/** The version of the employee `values` schema that new records are written with. */
export const IMPORT_EMPLOYEE_VERSION = 1;

/** The version of the employee choices schema that new choices are written with. */
export const IMPORT_EMPLOYEE_CHOICES_VERSION = 1;

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

/** A stored employee record, its `values` read with the schema of their version. */
export function toImportEmployee(record: typeof importRecords.$inferSelect): ImportEmployeeRecord {
  return {
    id: record.id,
    sourceId: record.sourceId,
    externalRecordId: record.externalRecordId,
    ...parseImportEmployeeValues(record.typeVersion, record.values),
    photoFileId: record.photoFileId,
  };
}

/** Stored employee choices and chosen manager, read with the schema of their version. */
export function parseImportEmployeeChoices(
  typeVersion: number,
  stored: { values: unknown; chosenManager: unknown },
): Pick<ImportEmployeeChoices, "values" | "chosenManager"> {
  if (typeVersion !== IMPORT_EMPLOYEE_CHOICES_VERSION) {
    throw new Error(`Unknown version ${typeVersion} of import employee choices`);
  }
  const chosenManager = managerChoice.nullable().parse(stored.chosenManager);
  return {
    values: employeeChoicesV1.parse(stored.values),
    ...(chosenManager && { chosenManager }),
  };
}

const valueChoice = z.union([
  z.object({ recordId: z.string() }).strict(),
  z.object({ value: z.string() }).strict(),
]);

const employeeChoicesV1 = z.object({
  firstName: valueChoice.optional(),
  lastName: valueChoice.optional(),
  email: valueChoice.optional(),
  jobTitle: valueChoice.optional(),
  manager: valueChoice.optional(),
  startDate: valueChoice.optional(),
});

const managerChoice = z.union([
  z.object({ employeeKey: z.string() }).strict(),
  z.object({ noManager: z.literal(true) }).strict(),
]);

const text = z.string().nullable();

const employeeValuesV1 = z.object({
  firstName: text,
  lastName: text,
  email: text,
  jobTitle: text,
  // Records read before managers were imported have none.
  manager: text.default(null),
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
