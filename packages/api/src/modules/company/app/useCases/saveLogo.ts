import type { SecurityContext } from "../../../../core/security";
import { invalidInput } from "../../../../core/applicationError";
import { normalizeImage } from "../../../../utils";
import { companyRepository } from "../../db";
import { type Company, type CompanyContext, MAX_LOGO_BYTES, readCompany } from "./company";

/** Replaces the company logo with an image the owner uploaded. */
export async function saveLogo(
  context: CompanyContext,
  ctx: SecurityContext,
  bytes: Buffer,
): Promise<Company> {
  ctx.requireSetupAccess();
  const logo = await normalizeImage(bytes, { maxBytes: MAX_LOGO_BYTES });
  if (!logo) {
    throw invalidInput([{ field: "logo", code: "invalid" }]);
  }
  await context.transact((tx) => companyRepository(tx).replaceLogo(logo));
  return readCompany(context);
}
