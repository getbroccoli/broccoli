import type { Orm } from "../../db";
import type { SecretBox } from "../../secrets";
import { instanceRepository } from "../db";

/** This install's Broccoli AI token, or null before its first AI decision. */
export async function readBroccoliAiToken(orm: Orm, secretBox: SecretBox): Promise<string | null> {
  const encrypted = await instanceRepository(orm).readBroccoliAiToken();
  return encrypted === null ? null : secretBox.decrypt(encrypted);
}

export async function saveBroccoliAiToken(
  orm: Orm,
  secretBox: SecretBox,
  token: string,
): Promise<void> {
  await instanceRepository(orm).saveBroccoliAiToken(secretBox.encrypt(token));
}
