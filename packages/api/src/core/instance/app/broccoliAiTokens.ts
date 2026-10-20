import type { Orm } from "../../db";
import { readSecret, saveSecret, type SecretBox } from "../../secrets";
import { instanceRepository } from "../db";

// Encrypted, in the data folder, so the trial token survives replacing the database.
const TOKEN_SECRET = "broccoli-ai-token";

/** The persistent Broccoli AI trial token of this install. */
export interface BroccoliAiTokens {
  /** Reads the token, moving an older database token into the data folder on first use. */
  read(): Promise<string | null>;
  save(token: string): Promise<void>;
}

export function createBroccoliAiTokens({
  orm,
  secretBox,
  dataDir,
}: {
  orm: Orm;
  secretBox: SecretBox;
  dataDir: string;
}): BroccoliAiTokens {
  return {
    read: () => readToken(orm, secretBox, dataDir),
    save: (token) => saveSecret(dataDir, TOKEN_SECRET, secretBox.encrypt(token)),
  };
}

async function readToken(orm: Orm, secretBox: SecretBox, dataDir: string): Promise<string | null> {
  const saved = await readSecret(dataDir, TOKEN_SECRET);
  if (saved !== null) {
    return secretBox.decrypt(saved);
  }
  const repository = instanceRepository(orm);
  const encrypted = await repository.readBroccoliAiToken();
  if (encrypted === null) {
    return null;
  }
  const token = secretBox.decrypt(encrypted);
  await saveSecret(dataDir, TOKEN_SECRET, encrypted);
  await repository.saveBroccoliAiToken(null);
  return token;
}
