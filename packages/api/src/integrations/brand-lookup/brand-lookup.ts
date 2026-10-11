import { z } from "zod";

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

const DEFAULT_TIMEOUT_MS = 2_000;
/** Larger than any logo Broccoli stores, base64-encoded, plus the JSON around it. */
const MAX_RESPONSE_BYTES = 1024 * 1024;

const brandResponse = z.object({
  name: z.string().nullable(),
  logo: z.object({ contentType: z.string(), base64: z.base64() }).nullable(),
});

/** The body as text; stops reading and fails beyond `MAX_RESPONSE_BYTES`. */
async function readText(response: Response): Promise<string> {
  if (!response.body) {
    return "";
  }
  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.length;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Brand lookup answer is too large");
    }
    chunks.push(read.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** `new URL` drops the last path segment of a base without a trailing slash. */
function withSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}
