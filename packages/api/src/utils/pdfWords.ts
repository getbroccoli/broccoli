import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { oneReadAtATime } from "./oneReadAtATime";

/** A word PyMuPDF read, in PDF points from the shown page's top-left corner. */
export interface PdfWord {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A page's size and its words, as PyMuPDF reads them. */
export interface PdfWordPage {
  width: number;
  height: number;
  words: PdfWord[];
}

/** The word reader's interpreter is missing: the install is broken, not the PDF. */
export class PdfWordsUnavailableError extends Error {
  constructor() {
    super("The PDF word reader is not installed");
    this.name = "PdfWordsUnavailableError";
  }
}

/**
 * Every page's words, read by the PyMuPDF reader in a contained process with the same memory,
 * time and output limits as `parsePdf`; null when it cannot read them within those limits. It
 * waits for any other heavy read, and an aborted `signal` ends it.
 */
export function readPdfWords(
  bytes: Uint8Array,
  { signal, command = READER }: { signal?: AbortSignal; command?: readonly string[] } = {},
): Promise<PdfWordPage[] | null> {
  return oneReadAtATime(() => readInProcess(bytes, command, signal), signal);
}

const MEMORY_LIMIT_MB = 512;
const TIMEOUT_MS = 30_000;
/** What the API reads back, so a small file cannot hand it a huge result. */
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_PAGES = 1000;
/** No coordinate of a real page lies further out, in points: PDF pages are at most 200 inches. */
const MAX_COORDINATE = 14_400;
// The reader sits beside the API, as packages/pdf-words in the repository and /app/pdf-words in the image.
const PACKAGE = new URL("../../../pdf-words/", import.meta.url);
const READER = [
  fileURLToPath(new URL(".venv/bin/python", PACKAGE)),
  "-I",
  fileURLToPath(new URL("pdf_words.py", PACKAGE)),
];

function readInProcess(
  bytes: Uint8Array,
  [program, ...args]: readonly string[],
  signal: AbortSignal | undefined,
): Promise<PdfWordPage[] | null> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const reader = spawn(
      "/bin/sh",
      ["-c", `ulimit -d ${MEMORY_LIMIT_MB * 1024} && exec "$@"`, "sh", program!, ...args],
      // No secrets reach the reader. NumPy, which PyMuPDF loads, otherwise reserves memory for a
      // thread per CPU, past the limit.
      { env: { OPENBLAS_NUM_THREADS: "1" }, stdio: ["pipe", "pipe", "ignore"] },
    );
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (result: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reader.kill("SIGKILL");
      result();
    };
    // An abort reason is a DOMException unless the caller passed its own error.
    const abort = () => finish(() => reject(signal!.reason as Error));
    const timer = setTimeout(() => finish(() => resolve(null)), TIMEOUT_MS);
    signal?.addEventListener("abort", abort, { once: true });
    reader.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) finish(() => resolve(null));
      else chunks.push(chunk);
    });
    reader.once("error", () => finish(() => resolve(null)));
    reader.once("close", (code) =>
      finish(() =>
        // 127: the shell found no program to run.
        code === 127
          ? reject(new PdfWordsUnavailableError())
          : resolve(code === 0 ? parsedPages(Buffer.concat(chunks)) : null),
      ),
    );
    reader.stdin.on("error", () => {});
    reader.stdin.end(bytes);
  });
}

const coordinate = z.number().finite().min(-MAX_COORDINATE).max(MAX_COORDINATE);
const outputSchema = z.object({
  pages: z
    .array(
      z.object({
        width: coordinate,
        height: coordinate,
        words: z.array(z.tuple([coordinate, coordinate, coordinate, coordinate, z.string()])),
      }),
    )
    .max(MAX_PAGES),
});

function parsedPages(output: Buffer): PdfWordPage[] | null {
  let json: unknown;
  try {
    json = JSON.parse(output.toString("utf8"));
  } catch {
    return null;
  }
  const parsed = outputSchema.safeParse(json);
  return parsed.success
    ? parsed.data.pages.map(({ width, height, words }) => ({
        width,
        height,
        words: words.map(([left, top, right, bottom, text]) => ({
          text,
          left,
          top,
          right,
          bottom,
        })),
      }))
    : null;
}
