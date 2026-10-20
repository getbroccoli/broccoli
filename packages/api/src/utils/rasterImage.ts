/** An image as pixels in a format browsers show safely: PNG, JPEG or WebP. */
export interface RasterImage {
  bytes: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const PNG_END = Buffer.from("0000000049454e44ae426082", "hex");
const JPEG_START = Buffer.from("ffd8ff", "hex");
const JPEG_END = Buffer.from("ffd9", "hex");
const WEBP_CHUNKS = new Set(["VP8 ", "VP8L", "VP8X"]);

/**
 * Each format's check of a whole file, not just its first bytes, so a truncated
 * upload is refused instead of replacing a working image. The pixels are not decoded.
 */
const FORMATS: { mimeType: RasterImage["mimeType"]; isComplete: (bytes: Buffer) => boolean }[] = [
  {
    mimeType: "image/png",
    isComplete: (bytes) =>
      bytes.subarray(0, 8).equals(PNG_SIGNATURE) &&
      bytes.toString("latin1", 12, 16) === "IHDR" &&
      bytes.subarray(-PNG_END.length).equals(PNG_END),
  },
  {
    mimeType: "image/jpeg",
    isComplete: (bytes) =>
      bytes.length > JPEG_START.length + JPEG_END.length &&
      bytes.subarray(0, 3).equals(JPEG_START) &&
      bytes.subarray(-JPEG_END.length).equals(JPEG_END),
  },
  {
    mimeType: "image/webp",
    isComplete: (bytes) =>
      bytes.length >= 16 &&
      bytes.toString("latin1", 0, 4) === "RIFF" &&
      bytes.readUInt32LE(4) === bytes.length - 8 &&
      bytes.toString("latin1", 8, 12) === "WEBP" &&
      WEBP_CHUNKS.has(bytes.toString("latin1", 12, 16)),
  },
];

/**
 * Untrusted bytes as a raster image: at most `maxBytes`, and a whole PNG, JPEG or
 * WebP file by its content, whatever the sender claimed. Null otherwise. SVG is never accepted:
 * it can carry scripts.
 */
export function parseRasterImage(
  bytes: Buffer,
  { maxBytes }: { maxBytes: number },
): RasterImage | null {
  if (bytes.length > maxBytes) {
    return null;
  }
  const format = FORMATS.find(({ isComplete }) => isComplete(bytes));
  return format ? { bytes, mimeType: format.mimeType } : null;
}
