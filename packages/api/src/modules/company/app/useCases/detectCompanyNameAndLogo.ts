import type { Orm, Transact, Tx } from "../../../../core/db";
import { readSetupStep } from "../../../../core/instance";
import { deleteFiles, storeFile } from "../../../../core/files";
import type { Logger } from "../../../../core/logger";
import type { SecurityContext } from "../../../../core/security";
import type { BrandLookup } from "../../../../integrations/brandLookup";
import { parseRasterImage, type RasterImage } from "../../../../utils";
import { companyRepository } from "../../db";
import { companyDomain } from "../../domain";
import { MAX_LOGO_BYTES } from "./company";

/**
 * Looks up the brand of the new owner's email domain once and keeps it for the
 * company step; an owner created after that step, as self-hosted setup does, gets
 * none. A failed lookup is logged; the domain suggestion still works.
 */
export async function detectCompanyNameAndLogo(
  {
    orm,
    transact,
    brandLookup,
    logger,
  }: { orm: Orm; transact: Transact; brandLookup: BrandLookup; logger: Logger },
  ctx: SecurityContext,
  { email }: { email: string },
): Promise<void> {
  ctx.requireOwnerOrSystem();
  const domain = companyDomain(email);
  if (!domain || (await readSetupStep(orm)) !== "company") {
    return;
  }
  try {
    // The HTTP call runs before the transaction, so no connection or lock waits on it.
    const brand = await brandLookup(domain);
    const logo = brand?.logo ? parseRasterImage(brand.logo, { maxBytes: MAX_LOGO_BYTES }) : null;
    await transact((tx) => saveBrandOnce(tx, brand?.name ?? null, logo));
  } catch (error) {
    logger.warn(
      { err: error },
      "Brand lookup failed; suggesting the company name from the email domain",
    );
  }
}

/** Stores the brand unless a lookup or the owner got there first; then the new logo file goes. */
async function saveBrandOnce(
  tx: Tx,
  brandName: string | null,
  logo: RasterImage | null,
): Promise<void> {
  const fileId = logo && (await storeFile(tx, { content: logo.bytes, mimeType: logo.mimeType }));
  const saved = await companyRepository(tx).saveBrandOnce(brandName, fileId);
  if (!saved && fileId) {
    await deleteFiles(tx, [fileId]);
  }
}
