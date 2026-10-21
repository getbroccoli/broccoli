import type { z } from "zod";

import { fetchBytes, readBytes } from "./fetchBytes";

/**
 * Requests a JSON answer, a GET unless `init` says otherwise, and parses it with
 * `schema`. Resolves null on 404. Rejects on another unsuccessful status, after
 * `timeoutMs`, on a body over `maxBytes`, on invalid JSON, or when the answer does
 * not match `schema`.
 */
export async function fetchJson<T>(
  url: URL,
  schema: z.ZodType<T>,
  options: { timeoutMs: number; maxBytes: number; init?: RequestInit },
): Promise<T | null> {
  const body = await fetchBytes(url, options);
  return body && schema.parse(JSON.parse(body.toString("utf8")));
}

/** The body as text; stops reading and fails beyond `maxBytes`. */
export async function readText(response: Response, maxBytes: number): Promise<string> {
  return (await readBytes(response, maxBytes)).toString("utf8");
}
