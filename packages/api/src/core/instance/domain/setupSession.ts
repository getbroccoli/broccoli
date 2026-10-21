import { hashSetupToken } from "../helpers";
import type { Instance } from "./instance";

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

/** Who holds setup, as seen by one browser. */
export type SetupHolder = "you" | "another_device" | "nobody";

/** Who holds setup for the browser that sent `token`; nobody once an owner exists. */
export function setupHolderOf(
  { ownerUserId, setupSession }: Instance,
  token: string | null,
  now: Date,
): SetupHolder {
  if (!setupSession || ownerUserId) {
    return "nobody";
  }
  return holdsSetup(setupSession, token, now) ? "you" : "another_device";
}

/** Whether `token` is the live token of `session`. */
export function holdsSetup(session: SetupSession, token: string | null, now: Date): boolean {
  return token !== null && session.tokenHash === hashSetupToken(token) && session.expiresAt > now;
}
