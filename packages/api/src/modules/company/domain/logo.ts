import { parseRasterImage, type RasterImage } from "../../../utils";

export const MAX_LOGO_BYTES = 512 * 1024;

/** The company logo as Broccoli stores and serves it. */
export type Logo = RasterImage;

/** A logo Broccoli accepts: a raster image of at most 512 KiB. */
export function parseLogo(bytes: Buffer): Logo | null {
  return parseRasterImage(bytes, { maxBytes: MAX_LOGO_BYTES });
}
