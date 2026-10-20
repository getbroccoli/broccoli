import { once } from "node:events";
import { mkdtempSync, rmSync, watch, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { onTestFinished } from "vitest";

import { readPdfWords } from "../../src/utils";

/** Holds the shared PDF queue until released, then returns one readable, empty page. */
export async function holdPdfRead() {
  const directory = mkdtempSync(join(tmpdir(), "held-pdf-read-"));
  const releaseFile = join(directory, "release");
  writeFileSync(releaseFile, "");
  const watcher = watch(directory);
  const started = once(watcher, "change");
  const reading = readPdfWords(
    Buffer.from(JSON.stringify({ pages: [{ width: 612, height: 792, words: [] }] })),
    {
      command: [
        process.execPath,
        "--jitless",
        "-e",
        `const fs = require("node:fs");
         const watcher = fs.watch(${JSON.stringify(releaseFile)});
         watcher.once("change", () => {
           watcher.close();
           process.stdin.pipe(process.stdout);
         });
         fs.mkdirSync(${JSON.stringify(join(directory, "started"))});`,
      ],
    },
  );
  const release = () => writeFileSync(releaseFile, "released");
  onTestFinished(async () => {
    release();
    try {
      await reading;
    } finally {
      watcher.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  await Promise.race([
    started,
    reading.then(() => {
      throw new Error("The queue holder exited before it was released");
    }),
  ]);
  watcher.close();
  return { directory, reading, release };
}
