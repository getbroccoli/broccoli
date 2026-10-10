import { z } from "zod";

import { invalidInput, type FieldError } from "../../../core/application-error";
import { isCalendarDate } from "../../../core/calendar-date";

const NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;
const JOB_TITLE_MAX_LENGTH = 100;

/** Someone who works for the company. Later also agents and robots. */
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  /** Work email, lowercased; unique. */
  email: string;
  jobTitle: string | null;
  /** First working day, `YYYY-MM-DD`. */
  startDate: string | null;
  createdAt: Date;
}

export interface NewEmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string | null;
  startDate?: string | null;
}

export type NewEmployee = Omit<Employee, "id" | "createdAt">;

const name = z.string().trim().min(1).max(NAME_MAX_LENGTH);

const newEmployeeSchema = z.object({
  firstName: name,
  lastName: name,
  email: z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).pipe(z.email()),
  jobTitle: z
    .string()
    .trim()
    .max(JOB_TITLE_MAX_LENGTH)
    .nullish()
    .transform((title) => title || null),
  startDate: z
    .string()
    .refine(isCalendarDate)
    .nullish()
    .transform((date) => date ?? null),
});

/** Validates and normalises a new employee; throws `INVALID_INPUT` naming each bad field. */
export function parseNewEmployee(input: NewEmployeeInput): NewEmployee {
  const result = newEmployeeSchema.safeParse(input);
  if (!result.success) {
    throw invalidInput(fieldErrorsOf(result.error));
  }
  return result.data;
}

/** One error per field: the first problem found is the one worth fixing. */
function fieldErrorsOf(error: z.ZodError): FieldError[] {
  const byField = new Map<string, string>();
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    if (!byField.has(field)) {
      byField.set(field, fieldErrorCode(issue));
    }
  }
  return [...byField].map(([field, code]) => ({ field, code }));
}

function fieldErrorCode(issue: z.core.$ZodIssue): string {
  if (issue.code === "too_small") {
    return "required";
  }
  if (issue.code === "too_big") {
    return "too_long";
  }
  return "invalid";
}
