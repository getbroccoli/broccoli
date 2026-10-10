import { randomBytes, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SECRET_BYTES = 32;

/**
 * Secrets live in `<dataDir>/secrets/<name>`, readable only by the app's user. The
 * database never holds them, so operators back up this folder with the database.
 */
export async function readOrCreateSecret(dataDir: string, name: string): Promise<string> {
  const existing = await readSecret(dataDir, name);
  if (existing !== undefined) {
    return existing;
  }
  const folder = secretsFolder(dataDir);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  // A unique draft per call; `wx` refuses to reuse a file another writer owns.
  const draft = join(folder, `.${name}.${randomUUID()}`);
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

/** The secret's value, or `undefined` when it does not exist. */
export async function readSecret(dataDir: string, name: string): Promise<string | undefined> {
  try {
    return await readFile(join(secretsFolder(dataDir), name), "utf8");
  } catch (error) {
    ignoreCode("ENOENT")(error);
    return undefined;
  }
}

export async function removeSecret(dataDir: string, name: string): Promise<void> {
  await rm(join(secretsFolder(dataDir), name), { force: true });
}

function secretsFolder(dataDir: string): string {
  return join(dataDir, "secrets");
}

function ignoreCode(code: string): (error: unknown) => void {
  return (error) => {
    if ((error as NodeJS.ErrnoException).code !== code) {
      throw error;
    }
  };
}
