import { expect, it } from "vitest";

import { PNG, JPEG, WEBP } from "#test/support";

import { parseRasterImage } from ".";

const limits = { maxBytes: 512 * 1024 };

it.each([
  { bytes: PNG, mimeType: "image/png" },
  { bytes: JPEG, mimeType: "image/jpeg" },
  { bytes: WEBP, mimeType: "image/webp" },
])("accepts a complete $mimeType image", ({ bytes, mimeType }) => {
  expect(parseRasterImage(bytes, limits)).toEqual({ bytes, mimeType });
});

it.each([
  { format: "SVG", bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') },
  { format: "GIF", bytes: Buffer.from("GIF89a") },
  { format: "empty input", bytes: Buffer.alloc(0) },
])("refuses $format", ({ bytes }) => {
  expect(parseRasterImage(bytes, limits)).toBeNull();
});

it("refuses an image larger than the limit", () => {
  expect(parseRasterImage(PNG, { maxBytes: PNG.length - 1 })).toBeNull();
});

it("refuses a PNG containing only its signature", () => {
  expect(parseRasterImage(PNG.subarray(0, 8), limits)).toBeNull();
});

it("refuses a PNG without an IHDR chunk after the signature", () => {
  const bytes = Buffer.concat([PNG.subarray(0, 8), PNG.subarray(33)]);

  expect(parseRasterImage(bytes, limits)).toBeNull();
});

it("refuses a PNG without its final IEND chunk", () => {
  expect(parseRasterImage(PNG.subarray(0, -12), limits)).toBeNull();
});

it("refuses a JPEG without its end-of-image marker", () => {
  expect(parseRasterImage(JPEG.subarray(0, -2), limits)).toBeNull();
});

it("refuses a WebP whose RIFF size does not match its length", () => {
  const bytes = Buffer.from(WEBP);
  bytes.writeUInt32LE(bytes.length - 7, 4);

  expect(parseRasterImage(bytes, limits)).toBeNull();
});

it("refuses a WebP without a supported image chunk", () => {
  const bytes = Buffer.from(WEBP);
  bytes.write("JUNK", 12, "ascii");

  expect(parseRasterImage(bytes, limits)).toBeNull();
});
