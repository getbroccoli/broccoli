import { createHash, randomBytes } from "node:crypto";

/** A new agent one-time code or session token: 32 random bytes, 43 characters of base64url. */
export function newExternalAgentSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** The stored form of an agent one-time code or session token; the secret itself never is. */
export function hashExternalAgentSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** `now` plus `hours`. */
export function hoursAfter(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}
