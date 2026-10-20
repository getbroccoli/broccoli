import type { SecurityContext } from "../../../../core/security";
import { invalidInput } from "../../../../core/applicationError";
import { deleteFiles, storeFile } from "../../../../core/files";
import { normalizeImage } from "../../../../utils";
import { companyRepository } from "../../db";
import {
  type Company,
  type CompanyContext,
  LOGO_MAX_SIDE,
  MAX_LOGO_BYTES,
  readCompany,
} from "./company";

/** Replaces the company logo with an image the owner uploaded. */
export async function saveLogo(
  context: CompanyContext,
  ctx: SecurityContext,
  bytes: Buffer,
): Promise<Company> {
  ctx.requireSetupAccess();
  const logo = await normalizeImage(bytes, { maxBytes: MAX_LOGO_BYTES, maxSide: LOGO_MAX_SIDE });
  if (!logo) {
    throw invalidInput([{ field: "logo", code: "invalid" }]);
  }
  await context.transact(async (tx) => {
    const fileId = await storeFile(tx, { content: logo.bytes, mimeType: logo.mimeType });
    const previousFileId = await companyRepository(tx).replaceLogo(fileId);
    await deleteFiles(tx, previousFileId ? [previousFileId] : []);
  });
  return readCompany(context);
}
