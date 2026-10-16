// macOS does not enforce RLIMIT_DATA; the memory-bound test needs Linux (CI and the image).
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

it("reads a page with an enormous image without decoding it", async () => {
  const bytes = samplePdfFile({ pages: [{ image: { width: 200_000, height: 200_000 } }] });

  expect(await parsePdf(bytes)).toEqual([{ width: 612, height: 792, items: [] }]);
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
