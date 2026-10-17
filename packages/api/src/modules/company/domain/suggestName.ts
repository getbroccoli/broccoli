import { domainToUnicode } from "node:url";

import { getDomainWithoutSuffix } from "tldts";
import { z } from "zod";

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

/** The lowercased domain of a work email; null for a malformed or personal address. */
export function companyDomain(email: string): string | null {
  if (!z.email().safeParse(email).success) {
    return null;
  }
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  const registeredName = getDomainWithoutSuffix(domain);
  if (!registeredName || PERSONAL_PROVIDERS.has(registeredName)) {
    return null;
  }
  return domain;
}

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

/** `example-robotics.co.uk` → "Example Robotics". */
function nameFromDomain(domain: string): string | null {
  const label = getDomainWithoutSuffix(domain);
  if (!label) {
    return null;
  }
  return (domainToUnicode(label) || label)
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
