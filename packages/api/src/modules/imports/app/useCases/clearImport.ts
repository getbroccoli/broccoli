import type { Tx } from "../../../../core/db";
import { deleteFiles } from "../../../../core/files";
import { importRepository } from "../../db";

/**
 * Deletes the whole import, joining `tx`: its sources, records and choices, and the files
 * they referenced except `keptFileIds`, which employees took as avatars.
 */
export async function clearImport(tx: Tx, keptFileIds: readonly string[] = []): Promise<void> {
  const kept = new Set(keptFileIds);
  const imports = importRepository(tx);
  // Callers hold the instance row already, so this keeps the instance-then-sources order.
  await imports.lockSources();
  const fileIds = await imports.deleteAll();
  await deleteFiles(
    tx,
    fileIds.filter((id) => !kept.has(id)),
  );
}
