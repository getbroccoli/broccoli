import type { Tx } from "../../../../core/db";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { SecurityContext } from "../../../../core/security";
import { createEmployeeSetupService } from "../../../employees";
import { importPhotoRepository, lockImport } from "../../db";
import { requireImportAccess } from "./requireImportAccess";

const employeeSetup = createEmployeeSetupService();

/** The end of an approved import: deleting what is left once setup completes or resets. */
export interface ImportLifecycleService {
  /** Deletes the approved import once setup is complete; its photos stay with the employees. */
  finishImport: (ctx: SecurityContext) => Promise<void>;
  /**
   * Deletes what is left of the approved import in the caller's transaction, and its photos but
   * the employees' avatars. Setup's reset runs it, in case the cleanup after completion did not.
   */
  deleteFinishedImport: (ctx: SecurityContext, tx: Tx) => Promise<void>;
}

export function createImportLifecycleService({
  transact,
  logger,
}: Pick<ModuleDependencies, "transact" | "logger">): ImportLifecycleService {
  return {
    async finishImport(ctx) {
      const deletedPhotos = await transact((tx) => deleteFinishedImport(ctx, tx));
      for (const photo of deletedPhotos) {
        logger.info(photo, "Deleted an unused import photo");
      }
    },
    async deleteFinishedImport(ctx, tx) {
      await deleteFinishedImport(ctx, tx);
    },
  };
}

/** Deletes the whole import with its uploaded files and photos, joining `tx`. */
export async function deleteImport(tx: Tx): Promise<void> {
  const imports = await lockImport(tx);
  await imports.deleteAll({ keepPhotos: false });
}

/** Returns the deleted photos, for the log after commit. */
async function deleteFinishedImport(ctx: SecurityContext, tx: Tx) {
  requireImportAccess(ctx);
  const imports = await lockImport(tx);
  const employees = await employeeSetup.findEmployeesWithAvatars(ctx, tx);
  const deleted = await importPhotoRepository(tx).deletePhotosExcept(
    employees.flatMap(({ avatarFileId }) => avatarFileId ?? []),
  );
  await imports.deleteAll({ keepPhotos: true });
  return deleted;
}
