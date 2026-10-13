import { type Actor, requireOwner } from "../../../../core/actor";
import { ApplicationError } from "../../../../core/applicationError";
import { runInTransaction } from "../../../../core/db";
import { importRepository } from "../../db";
import type { IncomingRecord } from "../../domain";
import type { ImportContext } from "./importContext";
import { readSlackRecords } from "./slackRecords";

/** Reads the connected workspace again; the Slack source then holds its current members. */
export async function refreshSlack(context: ImportContext, actor: Actor): Promise<void> {
  requireOwner(actor);
  const connection = await context.imports.readSlackConnection();
  if (!connection) {
    throw new ApplicationError("UNAVAILABLE", "Slack is not connected.");
  }
  const records = await readMembers(context, connection.encryptedToken);
  await runInTransaction(context.orm, context.eventBus, async (tx) => {
    const imports = importRepository(tx);
    // A connect since the read has stored newer members; they win.
    const current = await imports.lockSlackConnection();
    if (current?.encryptedToken !== connection.encryptedToken) {
      return;
    }
    const sourceId = await imports.saveSlackSource(current.teamName);
    await imports.syncEmployeeRecords(sourceId, records);
  });
}

async function readMembers(
  { slack, encryption, logger }: ImportContext,
  encryptedToken: string,
): Promise<IncomingRecord[]> {
  try {
    return await readSlackRecords(slack, encryption.decrypt(encryptedToken));
  } catch (error) {
    logger.warn({ err: error }, "Reading Slack failed");
    throw new ApplicationError("UNAVAILABLE", "Could not read Slack.");
  }
}
