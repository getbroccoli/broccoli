// The worker `parseXlsx` runs: Node loads this file by URL, so it imports no file of ours.
import { parentPort, workerData } from "node:worker_threads";

import { strFromU8, Unzip, UnzipInflate, type Unzipped, zipSync } from "fflate";
import readXlsxFile from "read-excel-file/node";
import { Parser } from "saxen";

import type { XlsxSheet } from "./xlsx";

/** The workbook's visible sheets that hold any value; throws when it cannot be read. */
async function readWorkbook(bytes: Uint8Array): Promise<XlsxSheet[]> {
  const entries = unpackBounded(bytes);
  const workbook = entries["xl/workbook.xml"];
  if (workbook === undefined) {
    throw new Error("Not a workbook");
  }
  const hidden = hiddenSheetPositions(strFromU8(workbook));
  // Repacked, so the reader's buffers follow the verified sizes, not the declared ones.
  const sheets = await readXlsxFile(Buffer.from(zipSync(entries, { level: 0 })));
  return sheets
    .filter((_, position) => !hidden.has(position))
    .map(({ sheet, data }) => ({ name: sheet, rows: readRows(data) }))
    .filter(({ rows }) => rows.length > 0);
}

/** A few megabytes of ZIP can declare or expand to gigabytes, outside the worker's heap limit. */
const MAX_UNPACKED_BYTES = 64 * 1024 * 1024;
/** Deflate expands at most about 1,000 times, so one step adds at most about 16 MB. */
const CHUNK_BYTES = 16 * 1024;

/** Every entry, unpacked; throws once the declared or unpacked total passes the limit. */
function unpackBounded(bytes: Uint8Array): Unzipped {
  const entries: Unzipped = {};
  let declaredBytes = 0;
  let unpackedBytes = 0;
  const unzip = new Unzip((file) => {
    declaredBytes += file.originalSize ?? 0;
    if (declaredBytes > MAX_UNPACKED_BYTES) {
      throw new Error("Workbook declares too much content");
    }
    const chunks: Uint8Array[] = [];
    file.ondata = (error, chunk, final) => {
      if (error) {
        throw error;
      }
      unpackedBytes += chunk.length;
      if (unpackedBytes > MAX_UNPACKED_BYTES) {
        throw new Error("Workbook unpacks too large");
      }
      chunks.push(chunk);
      if (final) {
        entries[file.name] = concat(chunks);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    unzip.push(bytes.subarray(offset, offset + CHUNK_BYTES), offset + CHUNK_BYTES >= bytes.length);
  }
  return entries;
}

function concat(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const joined = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

/**
 * Positions, in workbook order, of the sheets marked hidden or very hidden. Read with the
 * XML parser the reader is built on, prefixes dropped and entities decoded as it does, so
 * both see the same sheets.
 */
function hiddenSheetPositions(workbook: string): Set<number> {
  const hidden = new Set<number>();
  let position = 0;
  const parser = new Parser();
  parser.on("error", (error) => {
    throw error;
  });
  parser.on("openTag", (name, attributes, decodeEntities) => {
    if (withoutPrefix(name) !== "sheet") {
      return;
    }
    const state = Object.entries(attributes()).find(([key]) => withoutPrefix(key) === "state");
    if (state && HIDDEN_STATES.has(decodeEntities(state[1]))) {
      hidden.add(position);
    }
    position += 1;
  });
  parser.parse(workbook);
  return hidden;
}

const HIDDEN_STATES = new Set(["hidden", "veryHidden"]);

function withoutPrefix(name: string): string {
  return name.slice(name.indexOf(":") + 1);
}

function readRows(data: readonly (readonly unknown[])[]): string[][] {
  return data.map((row) => row.map(readCell)).filter((row) => row.some((cell) => cell !== ""));
}

/** As a spreadsheet application's CSV export would write it, but dates in ISO form. */
function readCell(value: unknown): string {
  if (value instanceof Date) {
    // Throws for a date out of range, which makes the workbook unreadable.
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return typeof value === "string" ? value.trim() : "";
}

// Last, so the constants above are set when the worker starts reading.
parentPort?.postMessage(await readWorkbook(workerData as Uint8Array));
