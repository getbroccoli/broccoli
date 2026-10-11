/** What the brand lookup service knows about a company, by its email domain. */
export interface Brand {
  name: string | null;
  /** Unchecked image bytes as the service sent them; the caller applies its logo rules. */
  logo: Buffer | null;
}

/**
 * Looks up a company by email domain, such as "example.com".
 *
 * - Resolves the brand when the service knows one.
 * - Resolves null when the lookup is disabled or the service knows no brand (404).
 * - Rejects on a network failure, a timeout, another status, an invalid answer, or
 *   an answer over 1 MiB.
 */
export type BrandLookup = (domain: string) => Promise<Brand | null>;
