export const MAX_LOGO_BYTES = 512 * 1024;

export interface Logo {
  bytes: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

const SIGNATURES: { mimeType: Logo["mimeType"]; matches: (bytes: Buffer) => boolean }[] = [
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
 * A logo Broccoli can store and serve: at most 512 KiB, PNG, JPEG or WebP by its
 * content, whatever the sender claimed. SVG is refused: it can carry scripts.
 */
export function parseLogo(bytes: Buffer): Logo | null {
  if (bytes.length > MAX_LOGO_BYTES) {
    return null;
  }
  const signature = SIGNATURES.find(({ matches }) => matches(bytes));
  return signature ? { bytes, mimeType: signature.mimeType } : null;
}
