import { fetchBytes, urlUnder } from "../../utils";

/** What the brand lookup service knows about a company, by its email domain. */
export interface Brand {
  name: string | null;
  /** Unchecked image bytes as the service sent them; the caller applies its logo rules. */
  logo: Buffer | null;
}

/**
 * Looks up a company by email domain, such as "example.com".
 *
 * - Resolves the brand when the service has an icon for the domain.
 * - Resolves null when the lookup is disabled or the service has no icon (404).
 * - Rejects on a network failure, a timeout, another status, or an answer over 1 MiB.
 */
export type BrandLookup = (domain: string) => Promise<Brand | null>;

/**
 * The client of a favicon service compatible with the open-source Vemetric favicon API:
 * `GET <url>/<domain>?size=256&format=png`. It finds no names, so the name is always null.
 * A null URL disables it: it then makes no request and always resolves null.
 */
export function createBrandLookup(
  url: string | null,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): BrandLookup {
  if (url === null) {
    return () => Promise.resolve(null);
  }
  return async (domain) => {
    const iconUrl = urlUnder(url, encodeURIComponent(domain));
    iconUrl.search = ICON_QUERY;
    const logo = await fetchBytes(iconUrl, { timeoutMs, maxBytes: MAX_RESPONSE_BYTES });
    return logo && { name: null, logo };
  };
}

const DEFAULT_TIMEOUT_MS = 2_000;
/** A raster icon as large as the logo Broccoli keeps, so SVG icons arrive drawn sharp. */
const ICON_QUERY = "size=256&format=png";
/** Far larger than a 256-pixel PNG icon. */
const MAX_RESPONSE_BYTES = 1024 * 1024;
