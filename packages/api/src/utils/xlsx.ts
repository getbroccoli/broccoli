import { Worker } from "node:worker_threads";

/** A visible sheet's rows of strings. */
export interface XlsxSheet {
  name: string;
  rows: string[][];
}

/**
 * The visible sheets of an Excel workbook that hold any value, in workbook order; null when it
 * cannot be read. Formulas are never evaluated: a cell reads the value its application saved.
 * Dates read `yyyy-mm-dd`; cells are trimmed and rows without any value dropped. Workbooks are
 * read one at a time.
 */
export function parseXlsx(bytes: Uint8Array, timeoutMs = 30_000): Promise<XlsxSheet[] | null> {
  // One at a time: each read may hold a few hundred megabytes of buffers.
  const sheets = queue.then(() => readInWorker(bytes, timeoutMs));
  // The next read waits for this one, whether it succeeded or not.
  queue = sheets.catch(() => undefined);
  return sheets;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Why a worker: the reader allocates whatever the file asks for (rows padded up to the farthest
 * cell, buffers sized by the archive), so a few kilobytes can run a process out of memory. In a
 * worker with capped memory and a timeout, such a file only ends the worker, never the API.
 */
function readInWorker(bytes: Uint8Array, timeoutMs: number): Promise<XlsxSheet[] | null> {
  return new Promise((resolve) => {
    const worker = new Worker(READER, { workerData: bytes, resourceLimits: WORKER_LIMITS });
    const finish = (sheets: XlsxSheet[] | null) => {
      clearTimeout(timer);
      void worker.terminate();
      resolve(sheets);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    worker.once("message", (sheets: XlsxSheet[]) => finish(sheets));
    worker.once("error", () => finish(null));
    worker.once("exit", () => finish(null));
  });
}

// Tests run the TypeScript source; the image runs the JavaScript built next to this file.
const READER = new URL(
  import.meta.url.endsWith(".ts") ? "./xlsxReader.ts" : "./xlsxReader.js",
  import.meta.url,
);
const WORKER_LIMITS = { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 };
