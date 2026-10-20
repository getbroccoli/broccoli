import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";

import { readPdfPages, samplePdfFile } from "#test/support";

import { hasScannedPage } from "./pdfSheets";

vi.setConfig({ testTimeout: 30_000 });

it.for([
  { name: "an image-only scan", scan: { images: [{ x: 0, y: 0, width: 612, height: 792 }] } },
  {
    name: "a full-page scan with a visible page number",
    scan: {
      images: [{ x: 0, y: 0, width: 612, height: 792 }],
      texts: [{ text: "Page 2 of 2", x: 280, y: 20 }],
    },
  },
  {
    name: "a scan covering 40% of a page",
    scan: { images: [{ x: 0, y: 0, width: 612, height: 316.8 }] },
  },
  {
    name: "a tiled scan",
    scan: {
      images: [
        { x: 0, y: 0, width: 306, height: 396 },
        { x: 306, y: 0, width: 306, height: 396 },
        { x: 0, y: 396, width: 306, height: 396 },
        { x: 306, y: 396, width: 306, height: 396 },
      ],
    },
  },
  {
    name: "an OCR scan",
    scan: {
      images: [{ x: 0, y: 0, width: 612, height: 792 }],
      texts: tableTexts().map((text) => ({ ...text, invisible: true })),
    },
  },
  {
    name: "an OCR scan whose hidden words touch visible dots",
    scan: {
      images: [{ x: 0, y: 0, width: 612, height: 792 }],
      texts: tableTexts().flatMap((text) => [
        { text: ".", x: text.x - 3, y: text.y },
        { ...text, invisible: true },
      ]),
    },
  },
  {
    name: "a full-page scan with a title and a page number in its footer",
    scan: {
      images: [{ x: 0, y: 0, width: 612, height: 792 }],
      texts: [
        { text: "Staff directory", x: 40, y: 20 },
        { text: "Page 2 of 2", x: 500, y: 20 },
      ],
    },
  },
])("refuses $name alone or after a valid table", async ({ scan }) => {
  const alone = samplePdfFile({ pages: [scan] });
  const afterTable = samplePdfFile({ pages: [{ texts: tableTexts() }, scan] });

  expect(hasScannedPage(await readPdfPages(alone))).toBe(true);
  expect(hasScannedPage(await readPdfPages(afterTable))).toBe(true);
});

it.for([
  "flate-decompression-bomb",
  "huge-image-under-cap",
  "scanned-refusal",
  "phone-photo-refusal",
  "mixed-text-scan-refusal",
  "ocr-scan-alone",
  "partial-scan-alone",
  "tiled-scan-alone",
  "fullpage-scan-native-label-alone",
  "text-table-plus-fullpage-scan",
  "text-table-plus-partial-scan",
  "text-table-plus-tiled-scan",
])("refuses %s as a scan", async (name) => {
  const bytes = await readFile(
    new URL(`../../../../../test/fixtures/pdf/${name}.pdf`, import.meta.url),
  );

  expect(hasScannedPage(await readPdfPages(bytes))).toBe(true);
});

function tableTexts() {
  return [
    { text: "Name", x: 40, y: 760 },
    { text: "Email", x: 200, y: 760 },
    { text: "Avery Stone", x: 40, y: 740 },
    { text: "avery@example.com", x: 200, y: 740 },
  ];
}
