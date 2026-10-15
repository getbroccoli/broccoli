import type { Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { employeeRepository } from "../db";
import { type NewEmployee, type NewEmployeeInput, tryParseNewEmployee } from "../domain";

/** What adding imported employees did. */
export interface ImportedEmployees {
  created: number;
  /** Inputs that do not make an employee, such as one without a last name. */
  incomplete: number;
  /** Inputs whose email an employee already has; among inputs with one email, the first wins. */
  emailTaken: number;
}

/** Adds employees proposed by an import, joining `tx`; skips the ones that do not parse or whose email is taken. */
export async function createImportedEmployees(
  ctx: SecurityContext,
  tx: Tx,
  inputs: readonly NewEmployeeInput[],
): Promise<ImportedEmployees> {
  ctx.requireOwnerOrSystem();
  const newEmployees = inputs
    .map(tryParseNewEmployee)
    .filter((employee): employee is NewEmployee => employee !== null);
  const created = await employeeRepository(tx).insertSkippingTakenEmails(newEmployees);
  return {
    created,
    incomplete: inputs.length - newEmployees.length,
    emailTaken: newEmployees.length - created,
  };
}
