import assert from "node:assert/strict";

/** Reads SSE data, preserving messages across chunks; a timeout returns null and cancels the stream. */
export function sseMessages(response: Response) {
  assert(response.body, "The SSE response has no body");
  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return {
    cancel: () => reader.cancel(),
    async next(timeoutMs = 2_000): Promise<string | null> {
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      });
      try {
        for (;;) {
          const boundary = /\r?\n\r?\n/.exec(buffer);
          if (boundary) {
            const lines = buffer.slice(0, boundary.index).split(/\r?\n/);
            buffer = buffer.slice(boundary.index + boundary[0].length);
            const data = lines.filter((line) => line.startsWith("data:"));
            if (data.length > 0) {
              return data.map((line) => line.slice(5).replace(/^ /, "")).join("\n");
            }
            continue;
          }
          const chunk = await Promise.race([reader.read(), timeout]);
          if (chunk === null) {
            await reader.cancel();
            return null;
          }
          assert(!chunk.done, "The SSE stream ended before the next message");
          buffer += decoder.decode(chunk.value, { stream: true });
        }
      } finally {
        clearTimeout(timer!);
      }
    },
  };
}
