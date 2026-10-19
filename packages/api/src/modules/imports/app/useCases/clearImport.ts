import type { Tx } from "../../../../core/db";
import { deleteFiles } from "../../../../core/files";
import { importRepository } from "../../db";

/**
 * Deletes the whole import, joining `tx`: its sources, records and choices, and the files
 * they referenced except `keptFileIds`, which employees took as avatars.
 */
export async function clearImport(tx: Tx, keptFileIds: readonly string[] = []): Promise<void> {
  const kept = new Set(keptFileIds);
  const fileIds = await importRepository(tx).deleteAll();
  await deleteFiles(
    tx,
    fileIds.filter((id) => !kept.has(id)),
  );
}
