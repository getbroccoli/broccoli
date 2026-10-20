import type { Orm } from "../../src/core/db";
import { instanceRepository } from "../../src/core/instance/db";
import { TEST_SECRET_BOX } from "./testSecretBox";

/** The AI source the owner saved, with the key decrypted, read past the use cases. */
export async function readSavedAiSource(orm: Orm) {
  const { source, encryptedOpenRouterKey } = await instanceRepository(orm).readAiSource();
  return {
    source,
    openRouterKey:
      encryptedOpenRouterKey === null ? null : TEST_SECRET_BOX.decrypt(encryptedOpenRouterKey),
  };
}
