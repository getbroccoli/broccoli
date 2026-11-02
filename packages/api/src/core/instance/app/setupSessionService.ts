import { randomBytes } from "node:crypto";

import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import { holdsSetup, OwnerExistsError, SETUP_SESSION_DAYS, SetupInProgressError } from "../domain";
import { hashSetupToken } from "../helpers";

/** Who holds setup, as seen by the browser that sent `token`. */
export type SetupHolder = "you" | "another_device" | "nobody";

/** The browser session that holds self-hosted setup until an owner exists. */
export interface SetupSessionService {
  /**
   * Gives setup to the first browser, or extends the session of the browser holding it.
   * Any other browser gets `SetupInProgressError`, also once the session has expired:
   * only a new, empty database frees setup again.
   */
  startSetup: (
    ctx: SecurityContext,
    tx: Tx,
    session: { token: string | null; now: Date },
  ) => Promise<{ token: string; expiresAt: Date }>;
  /** Who holds setup for the browser that sent `token`; nobody once an owner exists. Trusted read: no `ctx`. */
  readSetupHolder: (orm: Orm, session: { token: string | null; now: Date }) => Promise<SetupHolder>;
}

export function createSetupSessionService(): SetupSessionService {
  return {
    async startSetup(ctx, tx, { token, now }) {
      ctx.requireSystem();
      const { ownerUserId, setupSession } = await instanceRepository(tx).lockInstance();
      if (ownerUserId) {
        throw new OwnerExistsError();
      }
      if (setupSession && !holdsSetup(setupSession, token, now)) {
        throw new SetupInProgressError();
      }
      return saveSetupSession(tx, setupSession && token ? token : newSetupToken(), now);
    },
    async readSetupHolder(orm, { token, now }) {
      const { ownerUserId, setupSession } = await instanceRepository(orm).readInstance();
      if (!setupSession || ownerUserId) {
        return "nobody";
      }
      return holdsSetup(setupSession, token, now) ? "you" : "another_device";
    },
  };
}

/** Gives setup to the browser holding `token` for the next days, joining `tx`. */
export async function saveSetupSession(
  tx: Tx,
  token: string,
  now: Date,
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(now.getTime() + SETUP_SESSION_DAYS * DAY_MS);
  await instanceRepository(tx).saveSetupSession({ tokenHash: hashSetupToken(token), expiresAt });
  return { token, expiresAt };
}

/** A new random setup token, for a browser that holds none. */
export function newSetupToken(): string {
  return randomBytes(32).toString("base64url");
}

const DAY_MS = 24 * 60 * 60 * 1000;
