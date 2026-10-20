import type { SecurityContext } from "../../../../core/security";
import type { ImportContext } from "./importContext";
import { mapSlackMembers } from "./mapSlackMembers";
import { openImport } from "./openImport";
import { requireImportAccess } from "./requireImportAccess";
import { attachSlackPhotos, readSlackPhotos } from "./slackPhotos";

/**
 * Reads the connected Slack workspace into the import: the first time and on every
 * refresh, the Slack source then holds its current members with the photos downloaded
 * within the read's time budget.
 */
export async function readSlack(context: ImportContext, ctx: SecurityContext): Promise<void> {
  requireImportAccess(ctx);
  const startedAt = context.clock();
  // Slack is read before the transaction, which never waits on another service.
  const { workspace, members, snapshot } = await context.slack.readSlackMembers(ctx);
  const records = mapSlackMembers(members);
  const photos = await readSlackPhotos(context, ctx, records, startedAt);
  await context.transact(async (tx) => {
    // A connect since the read stored another connection; its members are read next time.
    if (!(await context.slack.isCurrentSlackConnection(ctx, tx, snapshot))) {
      return;
    }
    const imports = await openImport(tx);
    // A read that outlived Approve finds the import closed and must not bring it back.
    if (!imports) {
      return;
    }
    const sourceId = await imports.saveSlackSource(workspace.name);
    await imports.syncEmployeeRecords(sourceId, records);
    await attachSlackPhotos(tx, sourceId, photos);
  });
}
