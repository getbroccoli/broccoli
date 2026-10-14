import type { SecurityContext } from "../../../../core/security";
import { invalidInput } from "../../../../core/applicationError";
import { runInTransaction } from "../../../../core/db";
import { deleteFiles, storeFile } from "../../../../core/files";
import { parseRasterImage } from "../../../../utils";
import { companyRepository } from "../../db";
import { type Company, type CompanyContext, MAX_LOGO_BYTES, readCompany } from "./company";

/** Replaces the company logo with an image the owner uploaded. */
export async function saveLogo(
  context: CompanyContext,
  ctx: SecurityContext,
  bytes: Buffer,
): Promise<Company> {
  ctx.requireOwnerOrSystem();
  const logo = parseRasterImage(bytes, { maxBytes: MAX_LOGO_BYTES });
  if (!logo) {
    throw invalidInput([{ field: "logo", code: "invalid" }]);
  }
  await runInTransaction(context.orm, context.eventBus, async (tx) => {
    const fileId = await storeFile(tx, { content: logo.bytes, mimeType: logo.mimeType });
    const previousFileId = await companyRepository(tx).replaceLogo(fileId);
    await deleteFiles(tx, previousFileId ? [previousFileId] : []);
  });
  return readCompany(context);
}
