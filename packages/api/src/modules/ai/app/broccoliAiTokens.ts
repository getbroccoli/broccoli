import type { Orm } from "../../../core/db";
import { clearOldBroccoliAiToken, readOldBroccoliAiToken } from "../../../core/instance";
import { readSecret, saveSecret, type SecretBox } from "../../../core/secrets";
import type { SecurityContext } from "../../../core/security";

/** The persistent Broccoli AI trial token of this install. */
export interface BroccoliAiTokens {
  /** Reads the token, moving an older database token into the data folder on first use. */
  read(ctx: SecurityContext): Promise<string | null>;
  save(ctx: SecurityContext, token: string): Promise<void>;
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
    read: (ctx) => {
      ctx.requireOwnerOrSystem();
      return readToken(ctx, orm, secretBox, dataDir);
    },
    save: (ctx, token) => {
      ctx.requireOwnerOrSystem();
      return saveSecret(dataDir, TOKEN_SECRET, secretBox.encrypt(token));
    },
  };
}

// Encrypted, in the data folder, so the trial token survives replacing the database.
const TOKEN_SECRET = "broccoli-ai-token";

async function readToken(
  ctx: SecurityContext,
  orm: Orm,
  secretBox: SecretBox,
  dataDir: string,
): Promise<string | null> {
  const saved = await readSecret(dataDir, TOKEN_SECRET);
  if (saved !== null) {
    return secretBox.decrypt(saved);
  }
  const encrypted = await readOldBroccoliAiToken(ctx, orm);
  if (encrypted === null) {
    return null;
  }
  const token = secretBox.decrypt(encrypted);
  await saveSecret(dataDir, TOKEN_SECRET, encrypted);
  await clearOldBroccoliAiToken(ctx, orm);
  return token;
}
