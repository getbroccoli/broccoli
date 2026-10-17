import type { SecurityContext } from "../../../../core/security";
import { importRepository } from "../../db";
import type { ImportContext } from "./importContext";
import { mapSlackMembers } from "./mapSlackMembers";
import { requireImportAccess } from "./requireImportAccess";

/**
 * Reads the connected Slack workspace into the import: the first time and on every
 * refresh, the Slack source then holds its current members.
 */
export async function readSlack(context: ImportContext, ctx: SecurityContext): Promise<void> {
  requireImportAccess(ctx);
  // Slack is read before the transaction, which never waits on another service.
  const { workspace, members, snapshot } = await context.slack.readSlackMembers(ctx);
  const records = mapSlackMembers(members);
  await context.transact(async (tx) => {
    // A connect since the read stored another connection; its members are read next time.
    if (!(await context.slack.isCurrentSlackConnection(ctx, tx, snapshot))) {
      return;
    }
    const imports = importRepository(tx);
    const sourceId = await imports.saveSlackSource(workspace.name);
    await imports.syncEmployeeRecords(sourceId, records);
  });
}
