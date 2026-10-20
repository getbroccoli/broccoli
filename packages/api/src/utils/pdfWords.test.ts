import { once } from "node:events";
import { mkdtempSync, rmSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";

import { samplePdfFile } from "#test/support";

import { PdfWordsUnavailableError, readPdfWords } from "./pdfWords";

vi.setConfig({ testTimeout: 30_000 });

it("reads native words and rounded boxes from a real PDF", async () => {
  const bytes = samplePdfFile({
    pages: [{ texts: [{ text: "Avery Stone", x: 40, y: 700 }] }],
  });

  expect(await readPdfWords(bytes)).toEqual([
    {
      width: 612,
      height: 792,
      words: [
        { text: "Avery", left: 40, top: 81.2, right: 65.6, bottom: 95 },
        { text: "Stone", left: 68.3, top: 81.2, right: 94.5, bottom: 95 },
      ],
    },
  ]);
});

it("returns null for bytes that are not a PDF", async () => {
  expect(await readPdfWords(Buffer.from("Name,Email"))).toBeNull();
});

it("returns null when the reader writes malformed JSON", async () => {
  expect(
    await readPdfWords(new Uint8Array(), {
      command: [process.execPath, "--jitless", "-e", 'process.stdout.write("{")'],
    }),
  ).toBeNull();
});

it("returns null when a word coordinate is outside the supported range", async () => {
  const output = {
    pages: [{ width: 612, height: 792, words: [[0, 0, 14_401, 10, "Avery"]] }],
  };

  expect(
    await readPdfWords(new Uint8Array(), {
      command: [
        process.execPath,
        "--jitless",
        "-e",
        `process.stdout.write(${JSON.stringify(JSON.stringify(output))})`,
      ],
    }),
  ).toBeNull();
});

it("returns null when the reader writes more than four MiB", async () => {
  const output = {
    pages: [{ width: 612, height: 792, words: [[40, 70, 90, 80, "X".repeat(4 * 1024 * 1024)]] }],
  };
  const command = [
    process.execPath,
    "--jitless",
    "-e",
    `process.stdin.setEncoding("utf8"); process.stdin.pipe(process.stdout)`,
  ];

  expect(await readPdfWords(Buffer.from(JSON.stringify(output)), { command })).toBeNull();
});

it("reports a missing interpreter as an operational failure", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pdf-words-"));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));

  await expect(
    readPdfWords(new Uint8Array(), { command: [join(directory, "missing-python")] }),
  ).rejects.toBeInstanceOf(PdfWordsUnavailableError);
});

it("kills an aborted reader and lets the next PDF read finish", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pdf-words-"));
  const watcher = watch(directory);
  const started = once(watcher, "change");
  const controller = new AbortController();
  onTestFinished(() => {
    controller.abort();
    watcher.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const reading = readPdfWords(new Uint8Array(), {
    signal: controller.signal,
    command: [
      process.execPath,
      "--jitless",
      "-e",
      `require("node:fs").mkdirSync(${JSON.stringify(directory)} + "/" + process.pid);
       setInterval(() => {}, 1000);`,
    ],
  });
  const [, pid] = (await started) as [string, string];
  const reason = new Error("PDF read cancelled");
  const rejected = expect(reading).rejects.toBe(reason);

  controller.abort(reason);

  await rejected;
  const bytes = samplePdfFile({ pages: [{ texts: [{ text: "Avery", x: 40, y: 700 }] }] });
  expect(await readPdfWords(bytes)).toMatchObject([{ words: [{ text: "Avery" }] }]);
  expect(() => process.kill(Number(pid), 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
});
