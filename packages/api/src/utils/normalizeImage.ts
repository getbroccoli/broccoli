import sharp from "sharp";

import { parseRasterImage, type RasterImage } from "./rasterImage";

/**
 * Untrusted bytes as a small WebP image: `parseRasterImage` first, then decoded, turned
 * upright, fitted inside `MAX_SIDE` × `MAX_SIDE` without enlarging and re-encoded without
 * metadata, such as a photo's location. Null when it is not a usable image.
 */
export async function normalizeImage(
  bytes: Buffer,
  { maxBytes }: { maxBytes: number },
): Promise<RasterImage | null> {
  const image = parseRasterImage(bytes, { maxBytes });
  if (!image) {
    return null;
  }
  try {
    const webp = await sharp(image.bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .webp()
      .toBuffer();
    return { bytes: webp, mimeType: "image/webp" };
  } catch {
    return null;
  }
}

/** Over twice the largest image on a page, so it stays sharp on high-density screens. */
const MAX_SIDE = 256;

/** Decoding larger images would hold hundreds of megabytes; a logo or photo never needs it. */
const MAX_INPUT_PIXELS = 40_000_000;
