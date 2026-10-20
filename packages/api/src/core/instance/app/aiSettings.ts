import type { Orm, Tx } from "../../db";
import type { Mode } from "../../env";
import type { SecretBox } from "../../secrets";
import { instanceRepository } from "../db";
import { aiConfig, type AiConfig, type AiSource, type SavedAiSource } from "../domain";

/** Where the instance sends AI decisions: the owner's saved choice, decided for the mode. */
export interface AiSettings {
  /** The AI files are read with now, decided by `aiConfig`. */
  read(): Promise<AiConfig>;
  /**
   * Saves the owner's choice, joining `tx`; a given key replaces the saved one, without one
   * the saved key stays.
   */
  save(tx: Tx, choice: { source: AiSource; openRouterKey?: string }): Promise<void>;
}

export function createAiSettings({
  orm,
  secretBox,
  mode,
  environmentKey,
}: {
  orm: Orm;
  secretBox: SecretBox;
  mode: Mode;
  /** `OPENROUTER_API_KEY`, or null. */
  environmentKey: string | null;
}): AiSettings {
  return {
    read: async () => aiConfig(mode, await readSavedAiSource(orm, secretBox), environmentKey),
    save: async (tx, { source, openRouterKey }) => {
      await instanceRepository(tx).storeAiSource(
        source,
        openRouterKey === undefined ? undefined : secretBox.encrypt(openRouterKey),
      );
    },
  };
}

async function readSavedAiSource(orm: Orm, secretBox: SecretBox): Promise<SavedAiSource> {
  const { source, encryptedOpenRouterKey } = await instanceRepository(orm).readAiSource();
  return {
    source,
    openRouterKey:
      encryptedOpenRouterKey === null ? null : secretBox.decrypt(encryptedOpenRouterKey),
  };
}
