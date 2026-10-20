import type { Tx } from "../../../../core/db";
import type { SecurityContext } from "../../../../core/security";
import { lockImport } from "../../db";
import type { ImportContext } from "./importContext";
import { requireImportAccess } from "./requireImportAccess";

/**
 * Deletes the whole import, joining `tx`: its sources, records, choices and uploaded staff
 * files, and its photos unless `keepPhotos`, as when Approve gave them to the employees.
 */
export async function deleteImport(tx: Tx, { keepPhotos }: { keepPhotos: boolean }): Promise<void> {
  const imports = await lockImport(tx);
  await imports.deleteAll({ keepPhotos });
}

/** Deletes the approved import once setup is complete; its photos stay with the employees. */
export async function finishImport(context: ImportContext, ctx: SecurityContext): Promise<void> {
  requireImportAccess(ctx);
  await context.transact((tx) => deleteImport(tx, { keepPhotos: true }));
}
