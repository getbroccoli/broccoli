import { createFileStorageService, type StoredFile } from "../../../../core/files";
import type { SecurityContext } from "../../../../core/security";
import type { CompanyContext } from "./company";

const fileStorage = createFileStorageService();

/** The current logo's file, or null when `fileId` is not the current logo. */
export async function readLogo(
  { orm, companies }: CompanyContext,
  ctx: SecurityContext,
  fileId: string,
): Promise<StoredFile | null> {
  // Everyone signed in sees the company in their workspace menu.
  if (!ctx.user) {
    ctx.requireSetupAccess("MANAGE_WORKSPACE");
  }
  const { logoFileId } = await companies.read();
  return logoFileId === fileId ? fileStorage.readFile(orm, fileId) : null;
}
