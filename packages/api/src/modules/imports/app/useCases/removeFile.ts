import { deleteFiles } from "../../../../core/files";
import type { SecurityContext } from "../../../../core/security";
import { importRepository } from "../../db";
import type { ImportContext } from "./importContext";

/** Removes a file source, its records and the stored file; other sources stay. */
export async function removeFile(
  { transact }: ImportContext,
  ctx: SecurityContext,
  sourceId: string,
): Promise<void> {
  ctx.requireOwnerOrSystem();
  await transact(async (tx) => {
    const fileId = await importRepository(tx).deleteFileSource(sourceId);
    if (fileId !== null) {
      await deleteFiles(tx, [fileId]);
    }
  });
}
