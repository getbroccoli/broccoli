import { z } from "zod";

import { invalidInput, type FieldError } from "../../../core/applicationError";
import type { ListOrder } from "../../../core/pagination";
import { changeReasonSchema, type FieldChange } from "../../../core/records";
import { type CalendarDate, parseCalendarDate } from "../../../utils";
import { fieldErrorCode, fieldErrorsOf } from "../helpers";

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
  /** First working day: the start of their first employment. */
  startDate: CalendarDate | null;
  /** The file holding their avatar, or null. */
  avatarFileId: string | null;
  createdAt: Date;
  /** The user who signs in as this employee, or null. */
  userId: string | null;
}

/** What a list of employees can be sorted by. */
export type EmployeeOrderField = "NAME" | "EMAIL" | "START_DATE";

/** How a list of employees, or of people about to become employees, is sorted. */
export type EmployeeOrder = ListOrder<EmployeeOrderField>;

export interface NewEmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string | null;
  startDate?: string | null;
}

export type NewEmployee = Omit<Employee, "id" | "avatarFileId" | "createdAt" | "userId">;

/** The fields an update sends; an absent field stays as it is, and null clears a nullable one. */
export interface EmployeeUpdateInput {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  jobTitle?: string | null;
  startDate?: string | null;
  /** Their direct manager's employee id; null for none. */
  managerId?: string | null;
  /** Why the change is made, kept on its history line. */
  changeReason?: string | null;
}

/** A validated update: the fields to change, normalised, the manager, and the reason for its history line. */
export interface EmployeeUpdate {
  changes: Partial<NewEmployee>;
  /** Absent: unchanged; null: no manager. Not checked to be an employee yet. */
  managerId?: string | null;
  reason: string | null;
}

/** Work emails are unique: another employee already has this one. */
export class EmailTakenError extends Error {
  constructor() {
    super("Another employee already has this email");
    this.name = "EmailTakenError";
  }
}

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
    .transform((value, context) => {
      const date = parseCalendarDate(value);
      if (!date) {
        context.addIssue({ code: "custom", message: "Not a calendar date" });
        return z.NEVER;
      }
      return date;
    })
    .nullish()
    .transform((date) => date ?? null),
});

// An absent field stays absent: `partial` skips its normalisation, so it does not become null.
const employeeUpdateSchema = newEmployeeSchema
  .partial()
  .extend({ managerId: z.string().nullish(), changeReason: changeReasonSchema });

/** Validates and normalises a new employee; throws `INVALID_INPUT` naming each bad field. */
export function parseNewEmployee(input: NewEmployeeInput): NewEmployee {
  const result = newEmployeeSchema.safeParse(input);
  if (!result.success) {
    throw invalidInput(fieldErrorsOf(result.error));
  }
  return result.data;
}

/** Validates and normalises the fields an update sends; throws `INVALID_INPUT` naming each bad field. */
export function parseEmployeeUpdate(input: EmployeeUpdateInput): EmployeeUpdate {
  const result = employeeUpdateSchema.safeParse(input);
  if (!result.success) {
    // A required field sent as null is a cleared one, refused like a blank one.
    const cleared = (field: string) => input[field as keyof EmployeeUpdateInput] === null;
    throw invalidInput(
      fieldErrorsOf(result.error).map((error) =>
        cleared(error.field) ? { ...error, code: "required" } : error,
      ),
    );
  }
  const { changeReason: reason, managerId, ...changes } = result.data;
  return { changes, reason, ...(managerId !== undefined && { managerId }) };
}

/**
 * How a change turned `before` into `after`, field by field, as history keeps it: a new employee
 * has no `before`, a deleted one no `after`. Fields that did not change are left out.
 */
export function employeeChanges(before: Employee | null, after: Employee | null): FieldChange[] {
  return HISTORY_FIELDS.flatMap((field) => {
    const oldValue = before?.[field] ?? null;
    const newValue = after?.[field] ?? null;
    return oldValue === newValue ? [] : [{ field, oldValue, newValue }];
  });
}

/** Like `parseNewEmployee`, but null for input that does not make an employee. */
export function tryParseNewEmployee(input: NewEmployeeInput): NewEmployee | null {
  const result = newEmployeeSchema.safeParse(input);
  return result.success ? result.data : null;
}

/** The employee rules' field errors for `input`; empty when it makes an employee. */
export function employeeFieldErrors(input: NewEmployeeInput): FieldError[] {
  const result = newEmployeeSchema.safeParse(input);
  return result.success ? [] : fieldErrorsOf(result.error);
}

/** One field of a new employee as the employee rules normalise it, or why the rules refuse it. */
export function parseEmployeeField(
  field: keyof NewEmployeeInput,
  value: string,
): { value: string | null } | { code: string } {
  const result = newEmployeeSchema.shape[field].safeParse(value);
  return result.success
    ? { value: result.data ?? null }
    : { code: fieldErrorCode(result.error.issues[0]!) };
}

/** The fields whose changes history keeps, in the order a history line lists them. */
const HISTORY_FIELDS = ["firstName", "lastName", "email", "jobTitle", "startDate"] as const;
