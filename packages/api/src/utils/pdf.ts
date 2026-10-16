import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { oneReadAtATime } from "./oneReadAtATime";

/** A run of text pdf.js drew, in PDF points from the page's bottom-left corner. */
export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A page's size in PDF points and the text drawn on it. */
export interface PdfPage {
  width: number;
  height: number;
  items: PdfTextItem[];
}

/**
 * Every page's text, read in a contained process; null when the PDF cannot be read within its
 * memory, time, page and text limits. It waits for any other heavy read to finish.
 */
export function parsePdf(bytes: Uint8Array, timeoutMs = 30_000): Promise<PdfPage[] | null> {
  return oneReadAtATime(() => readInProcess(bytes, timeoutMs));
}

/**
 * Why a process: a worker's limits cap only its JavaScript heap, while pdf.js holds each decoded
 * stream whole outside it, so a few megabytes of PDF can fill the machine. The OS limits the
 * reader process's whole memory, and when it ends, the API keeps running. macOS does not enforce
 * the limit; Linux, where the image runs, does.
 */
function readInProcess(bytes: Uint8Array, timeoutMs: number): Promise<PdfPage[] | null> {
  return new Promise((resolve) => {
    let pages: PdfPage[] | null = null;
    // `--jitless`: compiled code reserves memory that counts against the limit, gigabytes of it.
    const reader = spawn(
      "/bin/sh",
      [
        "-c",
        `ulimit -d ${MEMORY_LIMIT_MB * 1024} && exec "$@"`,
        "sh",
        process.execPath,
        "--jitless",
        ...SOURCE_LOADER,
        fileURLToPath(PROCESS),
      ],
      { stdio: ["ignore", "ignore", "ignore", "ipc"], serialization: "advanced" },
    );
    const finish = () => {
      clearTimeout(timer);
      reader.kill("SIGKILL");
      resolve(pages);
    };
    const timer = setTimeout(finish, timeoutMs);
    reader.once("message", (json: string) => (pages = JSON.parse(json) as PdfPage[]));
    reader.once("exit", finish);
    // The reader could not start, or ended before it took the bytes.
    reader.once("error", finish);
    reader.send(bytes);
  });
}

/** The bound on the reader process's writable memory: its heap and every decoded buffer. */
const MEMORY_LIMIT_MB = 512;
// Tests run the TypeScript source, which Node strips only with WebAssembly, off when jitless.
const SOURCE_LOADER = import.meta.url.endsWith(".ts") ? ["--import", "tsx"] : [];
const PROCESS = new URL(
  import.meta.url.endsWith(".ts") ? "./pdfProcess.ts" : "./pdfProcess.js",
  import.meta.url,
);
