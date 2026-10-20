import type { Tx } from "../../../../core/db";
import { deleteFiles } from "../../../../core/files";
import { importRepository } from "../../db";

/** Deletes the whole import with every file it referenced, joining `tx`, for the demo instead. */
export async function clearImport(tx: Tx): Promise<void> {
  const imports = importRepository(tx);
  // Callers hold the instance row already, so this keeps the instance-then-sources order.
  await imports.lockSources();
  const { photoFileIds, uploadFileIds } = await imports.deleteAll();
  await deleteFiles(tx, [...photoFileIds, ...uploadFileIds]);
}
