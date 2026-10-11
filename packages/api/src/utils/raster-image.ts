/** An image as pixels in a format browsers show safely: PNG, JPEG or WebP. */
export interface RasterImage {
  bytes: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

const SIGNATURES: { mimeType: RasterImage["mimeType"]; matches: (bytes: Buffer) => boolean }[] = [
  {
    mimeType: "image/png",
    matches: (bytes) => bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  },
  {
    mimeType: "image/jpeg",
    matches: (bytes) => bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")),
  },
  {
    mimeType: "image/webp",
    matches: (bytes) =>
      bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP",
  },
];

/**
 * Untrusted bytes as a raster image: at most `maxBytes`, and PNG, JPEG or WebP by
 * their content, whatever the sender claimed. Null otherwise. SVG is never accepted:
 * it can carry scripts.
 */
export function parseRasterImage(
  bytes: Buffer,
  { maxBytes }: { maxBytes: number },
): RasterImage | null {
  if (bytes.length > maxBytes) {
    return null;
  }
  const signature = SIGNATURES.find(({ matches }) => matches(bytes));
  return signature ? { bytes, mimeType: signature.mimeType } : null;
}
