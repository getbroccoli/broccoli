import type { z } from "zod";

import { readBytes } from "./fetchBytes";

/** An unsuccessful answer; `status` lets a caller tell a busy service from a refusal. */
export class FetchStatusError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FetchStatusError";
  }
}

/**
 * Requests a JSON answer, a GET unless `init` says otherwise, and parses it with
 * `schema`. Resolves null on 404. Rejects with `FetchStatusError` on another
 * unsuccessful status, and rejects after `timeoutMs` or once `signal` aborts (the
 * body included), on a body over `maxBytes`, on invalid JSON, or when the answer does
 * not match `schema`.
 */
export async function fetchJson<T>(
  url: URL,
  schema: z.ZodType<T>,
  {
    timeoutMs,
    maxBytes,
    init,
    signal,
  }: { timeoutMs: number; maxBytes: number; init?: RequestInit; signal?: AbortSignal },
): Promise<T | null> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(url, {
    ...init,
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new FetchStatusError(
      response.status,
      `${init?.method ?? "GET"} ${url.origin} answered ${response.status}`,
    );
  }
  return schema.parse(JSON.parse(await readText(response, maxBytes)));
}

/** The body as text; stops reading and fails beyond `maxBytes`. */
export async function readText(response: Response, maxBytes: number): Promise<string> {
  return (await readBytes(response, maxBytes)).toString("utf8");
}
