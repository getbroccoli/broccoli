import { ApplicationError, invalidInput } from "../../../../core/applicationError";
import { storeFile } from "../../../../core/files";
import type { SecurityContext } from "../../../../core/security";
import { importRepository } from "../../db";
import { readSheet } from "../../domain";
import type { ImportContext } from "./importContext";

/** A staff file as the owner uploads it. */
export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

/**
 * Adds a CSV file as a source and queues its mapping, in one transaction; returns the
 * source's id. A file that cannot be read is refused and nothing is stored.
 */
export async function uploadFile(
  { transact, decisions, jobs }: ImportContext,
  ctx: SecurityContext,
  { name, bytes }: UploadedFile,
): Promise<string> {
  ctx.requireOwnerOrSystem();
  if (decisions === null) {
    throw new ApplicationError("UNAVAILABLE", "Reading files needs a model key.");
  }
  const sheet = readSheet(bytes);
  if (typeof sheet === "string") {
    throw invalidInput([{ field: "file", code: sheet }]);
  }
  return transact(async (tx) => {
    const imports = importRepository(tx);
    await imports.lockSources();
    const fileId = await storeFile(tx, { content: Buffer.from(bytes), mimeType: "text/csv" });
    const sourceId = await imports.insertFileSource(name, fileId);
    await jobs.send(tx, "imports.mapFile", { sourceId, attempt: 0 });
    return sourceId;
  });
}
