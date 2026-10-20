import { deleteFiles } from "../../../../core/files";
import type { SecurityContext } from "../../../../core/security";
import { importRepository } from "../../db";
import type { ImportContext } from "./importContext";
import { requireImportAccess } from "./requireImportAccess";

/**
 * Deletes the approved import once setup is complete: its sources, records, choices and
 * uploaded staff files. Its photos stay, as Approve gave them to the employees.
 */
export async function finishImport(context: ImportContext, ctx: SecurityContext): Promise<void> {
  requireImportAccess(ctx);
  await context.transact(async (tx) => {
    const imports = importRepository(tx);
    await imports.lockSources();
    const { uploadFileIds } = await imports.deleteAll();
    await deleteFiles(tx, uploadFileIds);
  });
}
