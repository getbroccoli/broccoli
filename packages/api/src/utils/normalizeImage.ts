import sharp from "sharp";

import { parseRasterImage, type RasterImage } from "./rasterImage";

/**
 * Untrusted bytes as a small WebP image: `parseRasterImage` first, then decoded, turned
 * upright, fitted inside `maxSide` × `maxSide` without enlarging and re-encoded without
 * metadata, such as a photo's location. Null when it is not a usable image.
 */
export async function normalizeImage(
  bytes: Buffer,
  { maxBytes, maxSide }: { maxBytes: number; maxSide: number },
): Promise<RasterImage | null> {
  const image = parseRasterImage(bytes, { maxBytes });
  if (!image) {
    return null;
  }
  try {
    const webp = await sharp(image.bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true })
      .webp()
      .toBuffer();
    return { bytes: webp, mimeType: "image/webp" };
  } catch {
    return null;
  }
}

/** Decoding larger images would hold hundreds of megabytes; a logo or photo never needs it. */
const MAX_INPUT_PIXELS = 40_000_000;
