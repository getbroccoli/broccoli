import { createHash, timingSafeEqual } from "node:crypto";

import type { Orm } from "../db";
import type { Mode } from "../env";
import type { Logger } from "../logger";
import { readOrCreateSecret, readSecret, removeSecret } from "../secrets";
import { hasOwner } from "./owner";

const SETUP_TOKEN = "setup-token";
/** Where `docker compose up` serves Broccoli when `PUBLIC_URL` is unset. */
const DEFAULT_PUBLIC_URL = "http://localhost:8080";

export interface SetupAnnouncement {
  orm: Orm;
  mode: Mode;
  dataDir: string;
  publicUrl?: string;
  logger: Logger;
}

/** On a self-hosted instance without an owner, logs the link that creates the owner. */
export async function announceSetup({
  orm,
  mode,
  dataDir,
  publicUrl = DEFAULT_PUBLIC_URL,
  logger,
}: SetupAnnouncement): Promise<void> {
  if (mode !== "self_hosted" || (await hasOwner(orm))) {
    return;
  }
  const token = await readOrCreateSecret(dataDir, SETUP_TOKEN);
  // The fragment never reaches servers, so the token stays out of access logs.
  const link = new URL(`/setup#token=${token}`, publicUrl);
  logger.warn(`Open ${link.href} to create the owner account`);
}

export async function isSetupToken(dataDir: string, candidate: string): Promise<boolean> {
  const token = await readSecret(dataDir, SETUP_TOKEN);
  return token !== undefined && timingSafeEqual(digest(token), digest(candidate));
}

export function removeSetupToken(dataDir: string): Promise<void> {
  return removeSecret(dataDir, SETUP_TOKEN);
}

/** Equal-length digests, so the comparison takes the same time for any candidate. */
function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
