import { randomBytes } from "node:crypto";

import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import {
  holdsSetup,
  OwnerExistsError,
  SETUP_SESSION_DAYS,
  SetupInProgressError,
  setupHolderOf,
  type SetupHolder,
} from "../domain";
import { hashSetupToken } from "../helpers";

/**
 * Gives setup to the first browser, or extends the session of the browser holding it.
 * Any other browser gets `SetupInProgressError`, also once the session has expired:
 * only a new, empty database frees setup again.
 */
export async function startSetup(
  ctx: SecurityContext,
  tx: Tx,
  { token, now }: { token: string | null; now: Date },
): Promise<{ token: string; expiresAt: Date }> {
  ctx.requireOwnerOrSystem();
  const instance = instanceRepository(tx);
  const { ownerUserId, setupSession } = await instance.lockInstance();
  if (ownerUserId) {
    throw new OwnerExistsError();
  }
  if (setupSession && !holdsSetup(setupSession, token, now)) {
    throw new SetupInProgressError();
  }
  return saveSetupSession(tx, setupSession && token ? token : newSetupToken(), now);
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

/** Who holds setup for the browser that sent `token`; nobody once an owner exists. */
export async function readSetupHolder(
  orm: Orm,
  { token, now }: { token: string | null; now: Date },
): Promise<SetupHolder> {
  return setupHolderOf(await instanceRepository(orm).readInstance(), token, now);
}

const DAY_MS = 24 * 60 * 60 * 1000;
