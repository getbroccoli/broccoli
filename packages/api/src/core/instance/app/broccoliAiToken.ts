import type { Orm } from "../../db";
import type { SecretBox } from "../../secrets";
import { instanceRepository, readBroccoliAiTokenFile, saveBroccoliAiTokenFile } from "../db";

/** Reads the persistent token, moving an older database token into the data folder on first use. */
export async function readBroccoliAiToken(
  orm: Orm,
  secretBox: SecretBox,
  dataDir: string,
): Promise<string | null> {
  const saved = await readBroccoliAiTokenFile(dataDir);
  if (saved !== null) {
    return secretBox.decrypt(saved);
  }
  const repository = instanceRepository(orm);
  const encrypted = await repository.readBroccoliAiToken();
  if (encrypted === null) {
    return null;
  }
  const token = secretBox.decrypt(encrypted);
  await saveBroccoliAiTokenFile(dataDir, encrypted);
  await repository.saveBroccoliAiToken(null);
  return token;
}

export async function saveBroccoliAiToken(
  secretBox: SecretBox,
  dataDir: string,
  token: string,
): Promise<void> {
  await saveBroccoliAiTokenFile(dataDir, secretBox.encrypt(token));
}
