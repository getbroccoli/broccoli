import { randomBytes } from "node:crypto";
import { link, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createSecretsFolder, draftPath, ignoreCode, readSecret } from "./secretFile";

const SECRET_BYTES = 32;

/** The secret `name` in the data folder, created at random by the first caller. */
export async function ensureSecret(dataDir: string, name: string): Promise<string> {
  const existing = await readSecret(dataDir, name);
  if (existing !== null) {
    return existing;
  }
  const folder = await createSecretsFolder(dataDir);
  const draft = draftPath(folder, name);
  await writeFile(draft, randomBytes(SECRET_BYTES).toString("base64url"), {
    mode: 0o600,
    flag: "wx",
  });
  try {
    // `link` fails when the secret exists, so a process starting at the same time
    // never replaces a secret another one has already handed out.
    await link(draft, join(folder, name)).catch(ignoreCode("EEXIST"));
  } finally {
    await rm(draft, { force: true });
  }
  return (await readSecret(dataDir, name)) as string;
}
