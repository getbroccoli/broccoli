import type { z } from "zod";

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
  if (!response.body) {
    return "";
  }
  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error(`Answer is larger than ${maxBytes} bytes`);
    }
    chunks.push(read.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
