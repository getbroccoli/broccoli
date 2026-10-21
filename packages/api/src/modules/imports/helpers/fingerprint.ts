import { createHash } from "node:crypto";

/** A short hash of `value`'s JSON: equal values give equal fingerprints. */
export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("base64url");
}
