import { emailDomain, nameFromDomain, registeredName } from "../helpers";

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

/** The lowercased domain of a work email; null for a malformed or personal address. */
export function companyDomain(email: string): string | null {
  const domain = emailDomain(email);
  const name = domain && registeredName(domain);
  if (!name || PERSONAL_PROVIDERS.has(name)) {
    return null;
  }
  return domain;
}

/** Registered names of free email providers: their domains say nothing about the company. */
const PERSONAL_PROVIDERS = new Set([
  "aol",
  "fastmail",
  "gmail",
  "gmx",
  "googlemail",
  "hotmail",
  "icloud",
  "live",
  "mac",
  "mail",
  "me",
  "msn",
  "outlook",
  "pm",
  "proton",
  "protonmail",
  "yahoo",
  "ymail",
]);
