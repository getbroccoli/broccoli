import { z } from "zod";

const DEFAULT_TIMEOUT_MS = 2_000;
/** Larger than any logo Broccoli stores, base64-encoded, plus the JSON around it. */
const MAX_RESPONSE_BYTES = 1024 * 1024;

/** What the brand lookup service knows about a domain. */
export interface Brand {
  name: string | null;
  /** The logo as the service sent it, not yet checked. */
  logo: Buffer | null;
}

/** Finds the brand of an email domain; null when none is known. */
export type BrandLookup = (domain: string) => Promise<Brand | null>;

const brandResponse = z.object({
  name: z.string().nullable(),
  logo: z.object({ contentType: z.string(), base64: z.base64() }).nullable(),
});

/**
 * The client of the brand lookup service: `GET <url>/brands/<domain>`. Without a URL
 * it never makes a request. Fails on an unexpected answer or after `timeoutMs`.
 */
export function createBrandLookup(
  url: string | null,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): BrandLookup {
  if (url === null) {
    return () => Promise.resolve(null);
  }
  return async (domain) => {
    const response = await fetch(new URL(`brands/${encodeURIComponent(domain)}`, withSlash(url)), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Brand lookup answered ${response.status}`);
    }
    const { name, logo } = brandResponse.parse(JSON.parse(await readText(response)));
    return { name, logo: logo ? Buffer.from(logo.base64, "base64") : null };
  };
}

/** The body as text; stops reading and fails beyond `MAX_RESPONSE_BYTES`. */
async function readText(response: Response): Promise<string> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > MAX_RESPONSE_BYTES) {
      throw new Error("Brand lookup answer is too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** `new URL` drops the last path segment of a base without a trailing slash. */
function withSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}
