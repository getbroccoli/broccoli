/**
 * Requests a binary answer, a GET unless `init` says otherwise, and returns its body.
 * Rejects on an unsuccessful status, after `timeoutMs`, or on a body over `maxBytes`.
 */
export async function fetchBytes(
  url: URL,
  { timeoutMs, maxBytes, init }: { timeoutMs: number; maxBytes: number; init?: RequestInit },
): Promise<Buffer> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${url.origin} answered ${response.status}`);
  }
  return readBytes(response, maxBytes);
}

/** An answer whose body exceeded the bytes its reader allowed. */
export class AnswerTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Answer is larger than ${maxBytes} bytes`);
    this.name = "AnswerTooLargeError";
  }
}

/** The body's bytes; stops reading and fails beyond `maxBytes`. */
export async function readBytes(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) {
    return Buffer.alloc(0);
  }
  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AnswerTooLargeError(maxBytes);
    }
    chunks.push(read.value);
  }
  return Buffer.concat(chunks);
}
