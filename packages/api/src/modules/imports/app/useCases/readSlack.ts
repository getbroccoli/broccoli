import { type Actor, requireOwner } from "../../../../core/actor";
import { runInTransaction } from "../../../../core/db";
import { importRepository } from "../../db";
import type { ImportContext } from "./importContext";
import { mapSlackMembers } from "./slackRecords";

/**
 * Reads the connected Slack workspace into the import: the first time and on every
 * refresh, the Slack source then holds its current members.
 */
export async function readSlack(context: ImportContext, actor: Actor): Promise<void> {
  requireOwner(actor);
  // Slack is read before the transaction, which never waits on another service.
  const { workspace, members, snapshot } = await context.slack.readSlackMembers();
  const records = mapSlackMembers(members);
  await runInTransaction(context.orm, context.eventBus, async (tx) => {
    // A connect since the read stored another connection; its members are read next time.
    if (!(await context.slack.isCurrentSlackConnection(tx, snapshot))) {
      return;
    }
    const imports = importRepository(tx);
    const sourceId = await imports.saveSlackSource(workspace.name);
    await imports.syncEmployeeRecords(sourceId, records);
  });
}
