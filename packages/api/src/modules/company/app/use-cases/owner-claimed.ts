import type { Logger } from "../../../../core/logger";
import type { BrandLookup } from "../../brand-lookup";
import type { CompanyRepository } from "../../db";
import { companyDomain, parseLogo } from "../../domain";

/**
 * Looks up the brand of the new owner's email domain once and keeps it for the
 * company step. A failed lookup is logged; the domain suggestion still works.
 */
export async function onOwnerClaimed(
  { companies, brandLookup, logger }: { companies: CompanyRepository; brandLookup: BrandLookup; logger: Logger },
  { email }: { email: string },
): Promise<void> {
  const domain = companyDomain(email);
  if (!domain) {
    return;
  }
  try {
    // Outside any transaction: a slow lookup holds no lock or connection.
    const brand = await brandLookup(domain);
    await companies.saveBrandOnce(brand?.name ?? null, brand?.logo ? parseLogo(brand.logo) : null);
  } catch (error) {
    logger.warn({ err: error }, "Brand lookup failed; suggesting the company name from the email domain");
  }
}
