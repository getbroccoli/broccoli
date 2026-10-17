import { randomBytes } from "node:crypto";

import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import {
  hashSetupToken,
  holdsSetup,
  OwnerExistsError,
  SETUP_SESSION_DAYS,
  SetupInProgressError,
} from "../domain";

/** Who holds setup, as seen by the browser that sent `token`. */
export type SetupHolder = "you" | "another_device" | "nobody";

/**
 * Gives setup to the first browser, or extends the session of the browser holding it.
 * Any other browser gets `SetupInProgressError`, also once the session has expired:
 * only `resetSetup` frees setup again.
 */
export async function startSetup(
  ctx: SecurityContext,
  tx: Tx,
  { token, now }: { token: string | null; now: Date },
): Promise<{ token: string; expiresAt: Date }> {
  ctx.requireOwnerOrSystem();
  const instance = instanceRepository(tx);
  const { ownerUserId, setupSession } = await instance.lockSetup();
  if (ownerUserId) {
    throw new OwnerExistsError();
  }
  if (setupSession && !holdsSetup(setupSession, token, now)) {
    throw new SetupInProgressError();
  }
  const heldToken = setupSession && token ? token : randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SETUP_SESSION_DAYS * DAY_MS);
  await instance.saveSetupSession({ tokenHash: hashSetupToken(heldToken), expiresAt });
  return { token: heldToken, expiresAt };
}

/** Who holds setup for the browser that sent `token`; nobody once an owner exists. */
export async function readSetupHolder(
  orm: Orm,
  { token, now }: { token: string | null; now: Date },
): Promise<SetupHolder> {
  const instance = instanceRepository(orm);
  const setupSession = await instance.readSetupSession();
  if (!setupSession || (await instance.readOwnerUserId())) {
    return "nobody";
  }
  return holdsSetup(setupSession, token, now) ? "you" : "another_device";
}

/** Frees setup held by a lost or stolen browser; the step and the data stay. */
export async function resetSetup(ctx: SecurityContext, tx: Tx): Promise<void> {
  ctx.requireOwnerOrSystem();
  const instance = instanceRepository(tx);
  if ((await instance.lockSetup()).ownerUserId) {
    throw new OwnerExistsError();
  }
  await instance.clearSetupSession();
}

const DAY_MS = 24 * 60 * 60 * 1000;
