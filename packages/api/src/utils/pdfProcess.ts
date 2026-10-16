// The process `parsePdf` starts: it reads the PDF in a worker thread and relays the result.
import { Worker } from "node:worker_threads";

process.once("message", (bytes: Uint8Array) => {
  const worker = new Worker(READER, { workerData: bytes, resourceLimits: WORKER_LIMITS });
  worker.once("message", (pages: string) => process.send?.(pages, () => process.exit(0)));
  worker.once("error", () => process.exit(1));
});

const READER = new URL(
  import.meta.url.endsWith(".ts") ? "./pdfReader.ts" : "./pdfReader.js",
  import.meta.url,
);
const WORKER_LIMITS = { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 };
