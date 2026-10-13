import { z } from "zod";

import { fetchJson, urlUnder } from "../../utils";

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

/**
 * The client of the brand lookup service: `GET <url>/brands/<domain>`. A null URL
 * disables it: it then makes no request and always resolves null.
 */
export function createBrandLookup(
  url: string | null,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): BrandLookup {
  if (url === null) {
    return () => Promise.resolve(null);
  }
  return async (domain) => {
    const brand = await fetchJson(
      urlUnder(url, `brands/${encodeURIComponent(domain)}`),
      brandResponse,
      {
        timeoutMs,
        maxBytes: MAX_RESPONSE_BYTES,
      },
    );
    if (!brand) {
      return null;
    }
    return { name: brand.name, logo: brand.logo ? Buffer.from(brand.logo.base64, "base64") : null };
  };
}

const DEFAULT_TIMEOUT_MS = 2_000;
/** Larger than any logo Broccoli stores, base64-encoded, plus the JSON around it. */
const MAX_RESPONSE_BYTES = 1024 * 1024;

const brandResponse = z.object({
  name: z.string().nullable(),
  logo: z.object({ contentType: z.string(), base64: z.base64() }).nullable(),
});
