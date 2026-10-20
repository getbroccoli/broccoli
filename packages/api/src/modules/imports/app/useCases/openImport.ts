import { ApplicationError } from "../../../../core/applicationError";
import type { Tx } from "../../../../core/db";
import { isImportOpen } from "../../../../core/instance";
import { type ImportRepository, lockImport } from "../../db";

/**
 * The repository that changes the import in `tx`, holding the lock Approve takes too, so
 * no change slips past it; null once Approve or the demo closed the import, so what
 * Approve created stays what review showed.
 */
export async function openImport(tx: Tx): Promise<ImportRepository | null> {
  const imports = await lockImport(tx);
  return (await isImportOpen(tx)) ? imports : null;
}

/** `openImport` for a change the owner asked for: refused once the import is closed. */
export async function lockOpenImport(tx: Tx): Promise<ImportRepository> {
  const imports = await openImport(tx);
  if (!imports) {
    throw new ApplicationError("CONFLICT", "Setup is complete.");
  }
  return imports;
}
