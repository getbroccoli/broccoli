import type { z } from "zod";

import { readBytes } from "./fetchBytes";

/**
 * Requests a JSON answer, a GET unless `init` says otherwise, and parses it with
 * `schema`. Resolves null on 404. Rejects on another unsuccessful status, after
 * `timeoutMs`, on a body over `maxBytes`, on invalid JSON, or when the answer does
 * not match `schema`.
 */
export async function fetchJson<T>(
  url: URL,
  schema: z.ZodType<T>,
  { timeoutMs, maxBytes, init }: { timeoutMs: number; maxBytes: number; init?: RequestInit },
): Promise<T | null> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${url.origin} answered ${response.status}`);
  }
  return schema.parse(JSON.parse(await readText(response, maxBytes)));
}

/** The body as text; stops reading and fails beyond `maxBytes`. */
export async function readText(response: Response, maxBytes: number): Promise<string> {
  return (await readBytes(response, maxBytes)).toString("utf8");
}
