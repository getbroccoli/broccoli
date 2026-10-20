import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Secrets live in `<dataDir>/secrets/<name>`, readable only by the app's user. The
 * database never holds them, so they survive replacing it; operators back up this folder
 * with the database.
 */
export async function readSecret(dataDir: string, name: string): Promise<string | null> {
  try {
    return await readFile(join(secretsFolder(dataDir), name), "utf8");
  } catch (error) {
    ignoreCode("ENOENT")(error);
    return null;
  }
}

/** Replaces the secret atomically, so an interrupted write leaves the previous one intact. */
export async function saveSecret(dataDir: string, name: string, value: string): Promise<void> {
  const folder = await createSecretsFolder(dataDir);
  const draft = draftPath(folder, name);
  try {
    await writeFile(draft, value, { mode: 0o600, flag: "wx" });
    await rename(draft, join(folder, name));
  } finally {
    await rm(draft, { force: true });
  }
}

/** Creates `<dataDir>/secrets`, readable only by the app's user; returns its path. */
export async function createSecretsFolder(dataDir: string): Promise<string> {
  const folder = secretsFolder(dataDir);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  return folder;
}

/** A unique draft per call; `wx` refuses to reuse a file another writer owns. */
export function draftPath(folder: string, name: string): string {
  return join(folder, `.${name}.${randomUUID()}`);
}

/** Lets an error with `code` pass silently and throws any other. */
export function ignoreCode(code: string): (error: unknown) => void {
  return (error) => {
    if ((error as NodeJS.ErrnoException).code !== code) {
      throw error;
    }
  };
}

function secretsFolder(dataDir: string): string {
  return join(dataDir, "secrets");
}
