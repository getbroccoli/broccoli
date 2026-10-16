import { invalidInput } from "../../../../core/applicationError";
import type { Transact } from "../../../../core/db";
import type { SecurityContext } from "../../../../core/security";
import { employeeFieldErrors } from "../../../employees";
import { importRepository, type ImportRepository } from "../../db";
import {
  hasOpenConflict,
  type ImportEmployee,
  type ImportEmployeeChoices,
  type ImportEmployeeField,
  type ValueChoice,
} from "../../domain";
import {
  incompleteReason,
  type IncompleteReason,
  readImportEmployees,
  toNewEmployeeInput,
} from "./importEmployeeMapping";

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
        if (choice && "value" in choice) {
          refuseBrokenValue(employee, field, choice.value);
        }
        return [withValue(employee, field, choice)];
      }),

    chooseSourceForAll: (ctx, { field, sourceId }) =>
      changeChoices(ctx, transact, (employees) =>
        employees.flatMap((employee) => {
          const record = employee.records.find(
            (candidate) =>
              candidate.sourceId === sourceId && holdsRecord(employee, field, candidate.id),
          );
          return hasOpenConflict(employee.values[field]) && record
            ? [withValue(employee, field, { recordId: record.id })]
            : [];
        }),
      ),

    setLeftOut: (ctx, { key, leftOut }) =>
      changeChoices(ctx, transact, (employees) => [
        { ...choicesOf(findEmployee(employees, key)), leftOut },
      ]),

    leaveOutIncomplete: (ctx, { reason }) =>
      changeChoices(ctx, transact, (employees) =>
        employees
          .filter((employee) => !employee.leftOut && incompleteReason(employee) === reason)
          .map((employee) => ({ ...choicesOf(employee), leftOut: true })),
      ),
  };
}

/** Reads the import employees and saves the choices `change` returns, in one transaction. */
async function changeChoices(
  ctx: SecurityContext,
  transact: Transact,
  change: (employees: ImportEmployee[]) => ImportEmployeeChoices[],
): Promise<void> {
  ctx.requireOwnerOrSystem();
  await transact(async (tx) => {
    const imports: ImportRepository = importRepository(tx);
    // Waits for a mapping run or Approve to finish, so the choices meet the records they read.
    await imports.lockSources();
    await imports.saveChoices("employee", change(await readImportEmployees(imports)));
  });
}

/** The import employee with this key; refused, naming `employeeId`, when there is none. */
function findEmployee(employees: ImportEmployee[], key: string): ImportEmployee {
  const employee = employees.find((candidate) => candidate.key === key);
  if (!employee) {
    throw invalidInput([{ field: "employeeId", code: "not_found" }]);
  }
  return employee;
}

/** The import employee's stored choices: its own, under its key. */
function choicesOf({ key, values, leftOut }: ImportEmployee): ImportEmployeeChoices {
  const chosen: ImportEmployeeChoices["values"] = {};
  for (const [field, { value, choice, options }] of Object.entries(values)) {
    if (choice === "typed" && value !== null) {
      chosen[field as ImportEmployeeField] = { value };
    } else if (choice === "picked") {
      const recordId = options.find((option) => option.value === value)!.recordIds[0]!;
      chosen[field as ImportEmployeeField] = { recordId };
    }
  }
  return { key, leftOut, values: chosen };
}

function withValue(
  employee: ImportEmployee,
  field: ImportEmployeeField,
  choice: ValueChoice | null,
): ImportEmployeeChoices {
  const choices = choicesOf(employee);
  const values = { ...choices.values };
  delete values[field];
  return { ...choices, values: choice ? { ...values, [field]: choice } : values };
}

function holdsRecord(employee: ImportEmployee, field: ImportEmployeeField, recordId: string) {
  return employee.values[field].options.some(({ recordIds }) => recordIds.includes(recordId));
}

/** Refuses a typed value that breaks the employee rule of its field, naming `value`. */
function refuseBrokenValue(employee: ImportEmployee, field: ImportEmployeeField, value: string) {
  const input = { ...toNewEmployeeInput(employee), [field]: value };
  const error = employeeFieldErrors(input).find((fieldError) => fieldError.field === field);
  if (error) {
    throw invalidInput([{ field: "value", code: error.code }]);
  }
}
