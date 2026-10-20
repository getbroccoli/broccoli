import { ApplicationError } from "../../../../core/applicationError";
import type { Tx } from "../../../../core/db";
import { isImportOpen } from "../../../../core/instance";
import { importRepository, type ImportRepository } from "../../db";

/**
 * Takes the sources lock that Approve takes too, so no change slips past it, and refuses
 * a change once Approve has run: what it created stays what review showed.
 */
export async function lockOpenImport(tx: Tx): Promise<ImportRepository> {
  const imports = importRepository(tx);
  await imports.lockSources();
  if (!(await isImportOpen(tx))) {
    throw new ApplicationError("CONFLICT", "Setup is complete.");
  }
  return imports;
}
