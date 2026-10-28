import { readFile, type StoredFile } from "../../../../core/files";
import type { SecurityContext } from "../../../../core/security";
import type { CompanyContext } from "./company";

/** The current logo's file, or null when `fileId` is not the current logo. */
export async function readLogo(
  { orm, companies }: CompanyContext,
  ctx: SecurityContext,
  fileId: string,
): Promise<StoredFile | null> {
  ctx.requireSetupAccess("MANAGE_WORKSPACE");
  const { logoFileId } = await companies.read();
  return logoFileId === fileId ? readFile(orm, fileId) : null;
}
