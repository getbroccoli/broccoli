// macOS does not enforce RLIMIT_DATA; the memory-bound test needs Linux (CI and the image).
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

import { pdfWithContentBomb, samplePdfFile } from "#test/support";

import { parsePdf } from ".";

it("reads each page's text with its position and the page's size", async () => {
  const bytes = samplePdfFile({
    pages: [
      {
        texts: [
          { text: "Avery", x: 40, y: 700 },
          { text: "Stone", x: 40, y: 680 },
        ],
      },
      { width: 400, height: 500, texts: [{ text: "Robin", x: 25, y: 450 }] },
    ],
  });

  expect(await parsePdf(bytes)).toEqual([
    {
      width: 612,
      height: 792,
      imageCoverage: 0,
      items: [
        {
          text: "Avery",
          x: 40,
          y: 700,
          width: expect.any(Number) as unknown,
          height: expect.any(Number) as unknown,
        },
        {
          text: "Stone",
          x: 40,
          y: 680,
          width: expect.any(Number) as unknown,
          height: expect.any(Number) as unknown,
        },
      ],
    },
    {
      width: 400,
      height: 500,
      imageCoverage: 0,
      items: [
        {
          text: "Robin",
          x: 25,
          y: 450,
          width: expect.any(Number) as unknown,
          height: expect.any(Number) as unknown,
        },
      ],
    },
  ]);
});

it("returns null when a page's content decodes past the memory bound", async () => {
  const bytes = await pdfWithContentBomb();

  expect(await parsePdf(bytes)).toBeNull();
}, 40_000);

it("reads a PDF after a read that ran out of memory", async () => {
  const bomb = await pdfWithContentBomb();
  const bytes = samplePdfFile({ pages: [{ texts: [{ text: "Avery", x: 40, y: 700 }] }] });
  expect(await parsePdf(bomb)).toBeNull();

  expect(await parsePdf(bytes)).toEqual([
    {
      width: 612,
      height: 792,
      imageCoverage: 0,
      items: [
        {
          text: "Avery",
          x: 40,
          y: 700,
          width: expect.any(Number) as unknown,
          height: expect.any(Number) as unknown,
        },
      ],
    },
  ]);
}, 65_000);

it("reads a page with an enormous image within the memory bound", async () => {
  const bytes = samplePdfFile({ pages: [{ image: { width: 200_000, height: 200_000 } }] });

  expect(await parsePdf(bytes)).toEqual([{ width: 612, height: 792, items: [], imageCoverage: 1 }]);
});

it("returns null for more than 1,000 pages", async () => {
  const bytes = samplePdfFile({ pages: Array.from({ length: 1001 }, () => ({})) });

  expect(await parsePdf(bytes)).toBeNull();
});

it("returns null for a PDF without pages", async () => {
  const bytes = samplePdfFile({ pages: [] });

  expect(await parsePdf(bytes)).toBeNull();
});

it("returns null for a truncated PDF", async () => {
  const bytes = samplePdfFile({ pages: [{ texts: [{ text: "Avery", x: 40, y: 700 }] }] });

  expect(await parsePdf(bytes.slice(0, Math.floor(bytes.length / 2)))).toBeNull();
});

it("returns null for bytes that are not a PDF", async () => {
  expect(await parsePdf(Buffer.from("Name,Email"))).toBeNull();
});

it("returns null when the text read exceeds 4 MB", async () => {
  const bytes = samplePdfFile({
    pages: Array.from({ length: 150 }, () => ({
      width: 4000,
      texts: Array.from({ length: 60 }, (_, row) => ({
        text: "A".repeat(500),
        x: 40,
        y: 760 - row * 12,
      })),
    })),
  });
  expect(bytes.byteLength).toBeLessThan(5 * 1024 * 1024);

  expect(await parsePdf(bytes)).toBeNull();
}, 40_000);

it("returns null when reading takes longer than the timeout", async () => {
  const bytes = samplePdfFile({ pages: [{ texts: [{ text: "Avery", x: 40, y: 700 }] }] });

  expect(await parsePdf(bytes, 1)).toBeNull();
});

it("reads text from a PDF with a script, an attachment and an external link", async () => {
  const bytes = samplePdfFile({
    pages: [{ texts: [{ text: "Avery", x: 40, y: 700 }] }],
    extras: "script-attachment-link",
  });

  expect(await parsePdf(bytes)).toEqual([
    {
      width: 612,
      height: 792,
      imageCoverage: 0,
      items: [
        {
          text: "Avery",
          x: 40,
          y: 700,
          width: expect.any(Number) as unknown,
          height: expect.any(Number) as unknown,
        },
      ],
    },
  ]);
});

it.for([
  {
    name: "a full-page image",
    page: { images: [{ x: 0, y: 0, width: 612, height: 792 }] },
    coverage: 1,
  },
  {
    name: "an image over 40% of the page",
    page: { images: [{ x: 0, y: 0, width: 612, height: 316.8 }] },
    coverage: 0.4,
  },
  {
    name: "four image tiles",
    page: {
      images: [
        { x: 0, y: 0, width: 306, height: 396 },
        { x: 306, y: 0, width: 306, height: 396 },
        { x: 0, y: 396, width: 306, height: 396 },
        { x: 306, y: 396, width: 306, height: 396 },
      ],
    },
    coverage: 1,
  },
  {
    name: "a small logo",
    page: { images: [{ x: 40, y: 730, width: 60, height: 40 }] },
    coverage: 2400 / (612 * 792),
  },
  { name: "an image inside a form", page: { formImage: true }, coverage: 1 },
  {
    name: "text without an image",
    page: { texts: [{ text: "Avery", x: 40, y: 700 }] },
    coverage: 0,
  },
])("measures image coverage for $name", async ({ page, coverage }) => {
  const pages = await parsePdf(samplePdfFile({ pages: [page] }));

  expect(pages).toHaveLength(1);
  if (!Array.isArray(pages)) throw new Error("The PDF must be readable");
  expect(pages[0]!.imageCoverage).toBeCloseTo(coverage);
});

it("leaves invisible OCR text out while keeping visible text on the same page", async () => {
  const bytes = samplePdfFile({
    pages: [
      {
        texts: [
          { text: "Hidden OCR", x: 40, y: 740, invisible: true },
          { text: "Visible label", x: 40, y: 700 },
        ],
      },
    ],
  });

  const pages = await parsePdf(bytes);

  expect(pages).toHaveLength(1);
  if (!Array.isArray(pages)) throw new Error("The PDF must be readable");
  expect(pages[0]!.items.map(({ text }) => text)).toEqual(["Visible label"]);
});

it("identifies a PDF that needs a password to open", async () => {
  const bytes = await readFile(
    new URL("../../test/fixtures/pdf/encrypted-refusal.pdf", import.meta.url),
  );

  expect(await parsePdf(bytes)).toBe("encrypted");
});

it("reads text from a PDF protected only by an owner password", async () => {
  const bytes = await readFile(
    new URL("../../test/fixtures/pdf/encrypted-owner-only.pdf", import.meta.url),
  );

  const pages = await parsePdf(bytes);

  expect(pages).toHaveLength(1);
  if (!Array.isArray(pages)) throw new Error("The PDF must open without a password");
  expect(pages.flatMap(({ items }) => items.map(({ text }) => text)).join(" ")).toContain(
    "lena.hart@birch.example",
  );
});
