import type { Tx } from "../../../../core/db";
import type { SecurityContext } from "../../../../core/security";
import { findEmployeesWithAvatars } from "../../../employees";
import { importPhotoRepository, lockImport } from "../../db";
import type { ImportContext } from "./importContext";
import { requireImportAccess } from "./requireImportAccess";

/** Deletes the whole import with its uploaded files and photos, joining `tx`. */
export async function deleteImport(tx: Tx): Promise<void> {
  const imports = await lockImport(tx);
  await imports.deleteAll({ keepPhotos: false });
}

/** Deletes the approved import once setup is complete; its photos stay with the employees. */
export async function finishImport(context: ImportContext, ctx: SecurityContext): Promise<void> {
  const deletedPhotos = await context.transact((tx) => deleteFinishedImport(ctx, tx));
  for (const photo of deletedPhotos) {
    context.logger.info(photo, "Deleted an unused import photo");
  }
}

/**
 * Deletes the approved import, joining `tx`, and its photos but the employees' avatars; returns
 * the deleted photos. Setup's reset also runs it, in case the cleanup after completion did not.
 */
export async function deleteFinishedImport(ctx: SecurityContext, tx: Tx) {
  requireImportAccess(ctx);
  const imports = await lockImport(tx);
  const employees = await findEmployeesWithAvatars(ctx, tx);
  const deleted = await importPhotoRepository(tx).deletePhotosExcept(
    employees.flatMap(({ avatarFileId }) => avatarFileId ?? []),
  );
  await imports.deleteAll({ keepPhotos: true });
  return deleted;
}
