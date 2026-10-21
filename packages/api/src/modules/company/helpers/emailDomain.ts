import { domainToUnicode } from "node:url";

import { getDomainWithoutSuffix } from "tldts";
import { z } from "zod";

/** The lowercased domain of an email; null for a malformed address. */
export function emailDomain(email: string): string | null {
  if (!z.email().safeParse(email).success) {
    return null;
  }
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

/** The domain's registered name without its public suffix: `mail.example.co.uk` → `example`. */
export function registeredName(domain: string): string | null {
  return getDomainWithoutSuffix(domain);
}

/** `example-robotics.co.uk` → "Example Robotics". */
export function nameFromDomain(domain: string): string | null {
  const label = registeredName(domain);
  if (!label) {
    return null;
  }
  return (domainToUnicode(label) || label)
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
