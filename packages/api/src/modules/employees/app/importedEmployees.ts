import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { employeeRepository } from "../db";
import { type NewEmployeeInput, tryParseNewEmployee } from "../domain";

/** What adding imported employees did. */
export interface ImportedEmployees {
  created: number;
  /** Inputs that do not make an employee, such as one without a last name. */
  incomplete: number;
  /** Inputs whose email an employee already has; among inputs with one email, the first wins. */
  emailTaken: number;
  /** The avatar files the created employees took; the caller still owns the others. */
  avatarFileIds: string[];
}

/** An employee an import proposes, with the stored photo it brings as its avatar. */
export type ImportedEmployeeInput = NewEmployeeInput & { avatarFileId?: string };

/** Adds employees proposed by an import, joining `tx`; skips the ones that do not parse or whose email is taken. */
export async function createImportedEmployees(
  ctx: SecurityContext,
  tx: Tx,
  inputs: readonly ImportedEmployeeInput[],
): Promise<ImportedEmployees> {
  ctx.requireSetupAccess();
  const newEmployees = inputs.flatMap(({ avatarFileId, ...input }) => {
    const employee = tryParseNewEmployee(input);
    return employee ? [{ ...employee, avatarFileId: avatarFileId ?? null }] : [];
  });
  const created = await employeeRepository(tx).insertSkippingTakenEmails(newEmployees);
  return {
    created: created.length,
    incomplete: inputs.length - newEmployees.length,
    emailTaken: newEmployees.length - created.length,
    avatarFileIds: created.flatMap(({ avatarFileId }) => (avatarFileId ? [avatarFileId] : [])),
  };
}

/** The emails among these that an employee already has, so an import adds no one with them; joins `db`. */
export async function findTakenEmails(
  ctx: SecurityContext,
  db: Orm | Tx,
  emails: readonly string[],
): Promise<Set<string>> {
  ctx.requireSetupAccess();
  return new Set(await employeeRepository(db).findTakenEmails(emails));
}

/** Deletes every employee, joining `tx`, when setup or the demo goes back to its start. */
export async function deleteAllEmployees(ctx: SecurityContext, tx: Tx): Promise<void> {
  ctx.requireSetupAccess();
  await employeeRepository(tx).deleteAll();
}
