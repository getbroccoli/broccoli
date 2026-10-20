import sharp from "sharp";
import { expect, it } from "vitest";

import { PNG } from "#test/support";

import { normalizeImage, parseRasterImage } from ".";

it("fits a large PNG inside 256 pixels as WebP", async () => {
  const bytes = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();

  const image = await normalizeImage(bytes, limits);

  expect(image?.mimeType).toBe("image/webp");
  expect(await sharp(image!.bytes).metadata()).toMatchObject({
    format: "webp",
    width: 256,
    height: 128,
  });
});

it("does not enlarge a small image", async () => {
  const bytes = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();

  const image = await normalizeImage(bytes, limits);

  expect(image).not.toBeNull();
  expect(await sharp(image!.bytes).metadata()).toMatchObject({ width: 100, height: 100 });
});

it("preserves a PNG's alpha channel", async () => {
  const bytes = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();

  const image = await normalizeImage(bytes, limits);

  expect(image).not.toBeNull();
  expect(await sharp(image!.bytes).metadata()).toMatchObject({ hasAlpha: true });
});

it("turns a JPEG upright before removing its EXIF metadata", async () => {
  const bytes = await sharp({
    create: { width: 100, height: 50, channels: 3, background: "white" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();

  const image = await normalizeImage(bytes, limits);

  expect(image).not.toBeNull();
  const metadata = await sharp(image!.bytes).metadata();
  expect(metadata).toMatchObject({ width: 50, height: 100 });
  expect(metadata.exif).toBeUndefined();
  expect(metadata.orientation).toBeUndefined();
});

it("refuses SVG", async () => {
  const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

  expect(await normalizeImage(bytes, limits)).toBeNull();
});

it("refuses an image larger than the byte limit", async () => {
  expect(await normalizeImage(PNG, { ...limits, maxBytes: PNG.length - 1 })).toBeNull();
});

it("refuses an image over 40 megapixels", async () => {
  const bytes = await sharp({
    create: { width: 8000, height: 6000, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  expect(bytes.length).toBeLessThan(limits.maxBytes);

  expect(await normalizeImage(bytes, limits)).toBeNull();
});

it("refuses a complete-looking PNG whose pixels cannot be decoded", async () => {
  const bytes = Buffer.concat([
    PNG.subarray(0, 33),
    Buffer.from("undecodable pixels"),
    PNG.subarray(-12),
  ]);
  expect(parseRasterImage(bytes, limits)).not.toBeNull();

  expect(await normalizeImage(bytes, limits)).toBeNull();
});

const limits = { maxBytes: 512 * 1024 };
