import { createHash } from "node:crypto";

/** How long a setup session lasts after its holder last started setup. */
export const SETUP_SESSION_DAYS = 3;

/** A setup session as stored: never the token itself, only its hash. */
export interface SetupSession {
  tokenHash: string;
  expiresAt: Date;
}

/** Setup is held by another browser, or locked after its session expired. */
export class SetupInProgressError extends Error {
  constructor() {
    super("Setup is in progress on another device");
    this.name = "SetupInProgressError";
  }
}

/** The stored form of a setup token. */
export function hashSetupToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Whether `token` is the live token of `session`. */
export function holdsSetup(session: SetupSession, token: string | null, now: Date): boolean {
  return token !== null && session.tokenHash === hashSetupToken(token) && session.expiresAt > now;
}
