import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** The encrypted trial token survives replacing the instance database. */
export async function readBroccoliAiTokenFile(dataDir: string): Promise<string | null> {
  try {
    return await readFile(join(dataDir, "secrets", "broccoli-ai-token"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    return null;
  }
}

/** Replaces the token atomically, so an interrupted write leaves the previous token intact. */
export async function saveBroccoliAiTokenFile(dataDir: string, encrypted: string): Promise<void> {
  const folder = join(dataDir, "secrets");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const draft = join(folder, `.broccoli-ai-token.${randomUUID()}`);
  try {
    await writeFile(draft, encrypted, { mode: 0o600, flag: "wx" });
    await rename(draft, join(folder, "broccoli-ai-token"));
  } finally {
    await rm(draft, { force: true });
  }
}
