import type { Orm, Tx } from "../../db";
import type { SecretBox } from "../../secrets";
import { instanceRepository } from "../db";
import type { SavedAiSource, AiSource } from "../domain";

/** Where the owner chose to send AI decisions, with their key decrypted. */
export async function readAiSource(db: Orm | Tx, secretBox: SecretBox): Promise<SavedAiSource> {
  const { source, encryptedOpenRouterKey } = await instanceRepository(db).readAiSource();
  return {
    source,
    openRouterKey:
      encryptedOpenRouterKey === null ? null : secretBox.decrypt(encryptedOpenRouterKey),
  };
}

/** Saves the owner's choice; a given key replaces the saved one, without one the saved key stays. */
export async function saveAiSource(
  tx: Tx,
  secretBox: SecretBox,
  { source, openRouterKey }: { source: AiSource; openRouterKey?: string },
): Promise<void> {
  await instanceRepository(tx).saveAiSource(
    source,
    openRouterKey === undefined ? undefined : secretBox.encrypt(openRouterKey),
  );
}
