import { invalidInput } from "../../../../core/applicationError";
import type { Transact } from "../../../../core/db";
import type { SecurityContext } from "../../../../core/security";
import { parseEmployeeField } from "../../../employees";
import {
  hasOpenConflict,
  IMPORT_EMPLOYEE_FIELDS,
  type ImportEmployee,
  type ImportEmployeeChoices,
  type ImportEmployeeField,
  incompleteReason,
  type IncompleteReason,
  type ValueChoice,
} from "../../domain";
import { readImportEmployees } from "./readImportEmployees";
import { lockOpenImport } from "./lockOpenImport";
import { requireImportAccess } from "./requireImportAccess";

/** What the owner settles in review: picked and typed values, and who is left out. Every function checks `ctx`. */
export interface EmployeeChoiceService {
  /**
   * Shows a record's value or a typed one for one field of an import employee; null puts
   * the first source's value back. A typed value must pass the employee rules for that field.
   */
  chooseEmployeeValue(
    ctx: SecurityContext,
    args: { key: string; field: ImportEmployeeField; choice: ValueChoice | null },
  ): Promise<void>;
  /** Picks this source's value for every open conflict on `field` that it holds a value in. */
  chooseSourceForAll(
    ctx: SecurityContext,
    args: { field: ImportEmployeeField; sourceId: string },
  ): Promise<void>;
  /** Leaves an import employee out of Approve, or adds it back. */
  setLeftOut(ctx: SecurityContext, args: { key: string; leftOut: boolean }): Promise<void>;
  /** Leaves out every incomplete import employee with this reason. */
  leaveOutIncomplete(ctx: SecurityContext, args: { reason: IncompleteReason }): Promise<void>;
}

export function createEmployeeChoiceService(transact: Transact): EmployeeChoiceService {
  return {
    chooseEmployeeValue: (ctx, { key, field, choice }) =>
      changeChoices(ctx, transact, (employees) => {
        const employee = findEmployee(employees, key);
        if (choice && "recordId" in choice && !holdsRecord(employee, field, choice.recordId)) {
          throw invalidInput([{ field: "recordId", code: "not_found" }]);
        }
        const normalised = choice && "value" in choice ? typedValue(field, choice.value) : choice;
        if (field === "email" && normalised && "value" in normalised) {
          refuseTakenEmail(employees, employee, normalised.value);
        }
        return withValue(employee, field, normalised);
      }),

    chooseSourceForAll: (ctx, { field, sourceId }) =>
      changeChoices(ctx, transact, (employees) =>
        employees.flatMap((employee) => {
          const record = employee.records.find(
            (candidate) =>
              candidate.sourceId === sourceId && holdsRecord(employee, field, candidate.id),
          );
          return hasOpenConflict(employee.values[field]) && record
            ? withValue(employee, field, { recordId: record.id })
            : [];
        }),
      ),

    setLeftOut: (ctx, { key, leftOut }) =>
      changeChoices(ctx, transact, (employees) =>
        withLeftOut(findEmployee(employees, key), leftOut),
      ),

    leaveOutIncomplete: (ctx, { reason }) =>
      changeChoices(ctx, transact, (employees) =>
        employees
          .filter((employee) => !employee.leftOut && incompleteReason(employee) === reason)
          .flatMap((employee) => withLeftOut(employee, true)),
      ),
  };
}

/** Reads the import employees and saves the choices `change` returns, in one transaction. */
async function changeChoices(
  ctx: SecurityContext,
  transact: Transact,
  change: (employees: ImportEmployee[]) => ImportEmployeeChoices[],
): Promise<void> {
  requireImportAccess(ctx);
  await transact(async (tx) => {
    // Waits for a mapping run or Approve to finish, so the choices meet the records they read.
    const imports = await lockOpenImport(tx);
    await imports.saveChoices("employee", change(await readImportEmployees(imports)));
  });
}

/**
 * The import employee with this key, also when a typed email merged it into another one;
 * refused, naming `employeeId`, when there is none.
 */
function findEmployee(employees: ImportEmployee[], key: string): ImportEmployee {
  const employee = employees.find((candidate) => candidate.keys.includes(key));
  if (!employee) {
    throw invalidInput([{ field: "employeeId", code: "not_found" }]);
  }
  return employee;
}

/**
 * The stored choices of everything the import employee is made of: all of them under its
 * own key, and for each import employee merged into it only the email that keeps them merged.
 */
function choicesOf(employee: ImportEmployee): ImportEmployeeChoices[] {
  const chosen: ImportEmployeeChoices["values"] = {};
  for (const field of IMPORT_EMPLOYEE_FIELDS) {
    const { value, choice, pickedRecordId } = employee.values[field];
    if (choice === "typed" && value !== null) {
      chosen[field] = { value };
    } else if (choice === "picked" && pickedRecordId !== null) {
      chosen[field] = { recordId: pickedRecordId };
    }
  }
  const [key, ...merged] = employee.keys;
  return [
    { key: key!, leftOut: employee.leftOut, values: chosen },
    ...merged.map((mergedKey) =>
      mergedChoices(mergedKey, employee.values.email.value, employee.leftOut),
    ),
  ];
}

/** The choices with one field changed; an email change moves every merged import employee along. */
function withValue(
  employee: ImportEmployee,
  field: ImportEmployeeField,
  choice: ValueChoice | null,
): ImportEmployeeChoices[] {
  const [own, ...merged] = choicesOf(employee);
  const values = { ...own!.values };
  delete values[field];
  const changed = { ...own!, values: choice ? { ...values, [field]: choice } : values };
  if (field !== "email") {
    return [changed, ...merged];
  }
  const email =
    choice && "recordId" in choice ? emailOfRecord(employee, choice.recordId) : choice?.value;
  return [changed, ...merged.map(({ key }) => mergedChoices(key, email ?? null, employee.leftOut))];
}

/** Leaves out every import employee it is made of, so it stays left out whichever key leads. */
function withLeftOut(employee: ImportEmployee, leftOut: boolean): ImportEmployeeChoices[] {
  return choicesOf(employee).map((choices) => ({ ...choices, leftOut }));
}

/** A merged-in import employee's choices: the shared email, or none, which splits it off. */
function mergedChoices(key: string, email: string | null, leftOut: boolean): ImportEmployeeChoices {
  return { key, leftOut, values: email === null ? {} : { email: { value: email } } };
}

/** Two import employees never share an email by typing: the owner leaves one out instead. */
function refuseTakenEmail(employees: ImportEmployee[], employee: ImportEmployee, email: string) {
  if (employees.some((other) => other !== employee && other.values.email.value === email)) {
    throw invalidInput([{ field: "value", code: "taken" }]);
  }
}

function holdsRecord(employee: ImportEmployee, field: ImportEmployeeField, recordId: string) {
  return employee.values[field].options.some(({ recordIds }) => recordIds.includes(recordId));
}

function emailOfRecord(employee: ImportEmployee, recordId: string): string | null {
  return (
    employee.values.email.options.find(({ recordIds }) => recordIds.includes(recordId))?.value ??
    null
  );
}

/** A typed value as the employee rules normalise it; refused, naming `value`, when they refuse it or it is blank. */
function typedValue(field: ImportEmployeeField, value: string): ValueChoice {
  const parsed = parseEmployeeField(field, value);
  if ("code" in parsed) {
    throw invalidInput([{ field: "value", code: parsed.code }]);
  }
  if (!parsed.value) {
    throw invalidInput([{ field: "value", code: "required" }]);
  }
  return { value: parsed.value };
}
