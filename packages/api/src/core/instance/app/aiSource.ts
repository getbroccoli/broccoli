import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import type { AiSource } from "../domain";

/** The saved AI source and the encrypted OpenRouter key; both null until the owner chooses. */
export function readAiSource(
  ctx: SecurityContext,
  orm: Orm,
): Promise<{ source: AiSource | null; encryptedOpenRouterKey: string | null }> {
  ctx.requireSetupAccess();
  return instanceRepository(orm).readAiSource();
}

/** Saves the AI source, and the encrypted key when one is given, joining `tx`. */
export function saveAiSource(
  ctx: SecurityContext,
  tx: Tx,
  source: AiSource,
  encryptedOpenRouterKey?: string,
): Promise<void> {
  ctx.requireSetupAccess();
  return instanceRepository(tx).storeAiSource(source, encryptedOpenRouterKey);
}

/** The encrypted Broccoli AI token an older version kept on the instance row; null without one. */
export function readOldBroccoliAiToken(ctx: SecurityContext, orm: Orm): Promise<string | null> {
  ctx.requireOwnerOrSystem();
  return instanceRepository(orm).readBroccoliAiToken();
}

/** Removes that token once it has moved to the data folder. */
export function clearOldBroccoliAiToken(ctx: SecurityContext, orm: Orm): Promise<void> {
  ctx.requireOwnerOrSystem();
  return instanceRepository(orm).saveBroccoliAiToken(null);
}
