import type { Orm, Tx } from "../../../core/db";
import { createRecordHistoryService, type HistoryAppend } from "../../../core/records";
import { readOwner } from "../../../core/instance";
import type { SecurityContext } from "../../../core/security";
import { employeeRepository, employmentRepository } from "../db";
import { type Employee, type NewEmployeeInput, tryParseNewEmployee } from "../domain";
import { setNewEmployeeManagers } from "./useCases/employeeManagers";
import { recordCreatedEmployees } from "./recordCreatedEmployees";

const recordHistory = createRecordHistoryService();

/** What adding imported employees did. */
export interface ImportedEmployees {
  created: number;
  /** Inputs that do not make an employee, such as one without a last name. */
  incomplete: number;
  /** Inputs whose email an employee already has; among inputs with one email, the first wins. */
  emailTaken: number;
}

/**
 * An employee an import proposes, with the stored photo it brings as its avatar and the email of
 * their manager among the same inputs.
 */
export type ImportedEmployeeInput = NewEmployeeInput & {
  avatarFileId?: string;
  managerEmail?: string | null;
};

/**
 * Adds employees proposed by an import, joining `tx`, with `cause` on their creation lines;
 * skips the ones that do not parse or whose email is taken.
 */
export async function createImportedEmployees(
  ctx: SecurityContext,
  tx: Tx,
  inputs: readonly ImportedEmployeeInput[],
  cause: HistoryAppend["cause"],
): Promise<ImportedEmployees> {
  ctx.requireSetupAccess("MANAGE_WORKSPACE");
  const managerEmails = new Map<string, string>();
  const newEmployees = inputs.flatMap(({ avatarFileId, managerEmail, ...input }) => {
    const employee = tryParseNewEmployee(input);
    if (employee && managerEmail) {
      managerEmails.set(employee.email, managerEmail);
    }
    return employee ? [{ ...employee, avatarFileId: avatarFileId ?? null }] : [];
  });
  const created = await employeeRepository(tx).insertSkippingTakenEmails(newEmployees);
  const managers = await setNewEmployeeManagers(tx, created, managerEmails);
  await recordCreatedEmployees(ctx, tx, created, cause, managers);
  return {
    created: created.length,
    incomplete: inputs.length - newEmployees.length,
    emailTaken: newEmployees.length - created.length,
  };
}

/** Employees with stored avatars, joining `db`, so cleanup can preserve the files they use. */
export function findEmployeesWithAvatars(ctx: SecurityContext, db: Orm | Tx): Promise<Employee[]> {
  ctx.requireSetupAccess("MANAGE_WORKSPACE");
  return employeeRepository(db).findWithAvatars();
}

/** The emails among these that an employee already has, so an import adds no one with them; joins `db`. */
export async function findTakenEmails(
  ctx: SecurityContext,
  db: Orm | Tx,
  emails: readonly string[],
): Promise<Set<string>> {
  ctx.requireSetupAccess("MANAGE_WORKSPACE");
  return new Set(await employeeRepository(db).findTakenEmails(emails));
}

/**
 * Deletes every employee and all employee history, joining `tx`, when setup or the demo goes
 * back to its start: what was there leaves no trace, unlike an ordinary removal.
 */
export async function deleteAllEmployees(ctx: SecurityContext, tx: Tx): Promise<void> {
  ctx.requireSetupAccess("MANAGE_WORKSPACE");
  // Before the employees table, in the order a manager change takes them, so the two cannot deadlock.
  await employmentRepository(tx).lockForWrites();
  // The owner keeps their user, so they stay signed in.
  const owner = await readOwner(tx);
  await employeeRepository(tx).deleteAll(owner?.userId ?? null);
  // After the delete, which waits for any update holding an employee row, so its line goes too.
  await recordHistory.purge(tx, "employee");
}
