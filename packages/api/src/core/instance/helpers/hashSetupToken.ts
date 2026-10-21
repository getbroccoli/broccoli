import { createHash } from "node:crypto";

/** The stored form of a setup token. */
export function hashSetupToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
