import { z } from "zod";

import { readFile, type StoredFile } from "../../../../core/files";
import type { SecurityContext } from "../../../../core/security";
import { importPhotoRepository } from "../../db";
import type { ImportContext } from "./importContext";
import { requireImportAccess } from "./requireImportAccess";

/** The import record's photo with this file id, or null when it is no record's photo. */
export async function readImportPhoto(
  { orm }: Pick<ImportContext, "orm">,
  ctx: SecurityContext,
  fileId: string,
): Promise<StoredFile | null> {
  requireImportAccess(ctx);
  // Postgres refuses a malformed uuid, so only a parsed one reaches the query.
  const id = z.uuid().safeParse(fileId);
  return id.success && (await importPhotoRepository(orm).hasPhoto(id.data))
    ? readFile(orm, id.data)
    : null;
}
