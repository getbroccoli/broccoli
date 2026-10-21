import { companyDomain, nameFromDomain } from "../helpers";

/**
 * Pre-fill for the company name: the brand name, else a name made from the owner's
 * email domain; a self-hosted instance names its company before the owner exists.
 */
export function suggestName({
  brandName,
  ownerEmail,
}: {
  brandName: string | null;
  ownerEmail: string | null;
}): string | null {
  const brand = brandName?.trim();
  if (brand) {
    return brand;
  }
  const domain = ownerEmail && companyDomain(ownerEmail);
  return domain ? nameFromDomain(domain) : null;
}
