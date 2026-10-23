import type { SecurityContext } from "../../../../core/security";
import type { ImportContext } from "./importContext";
import { mapSlackMembers } from "./mapSlackMembers";
import { openImport } from "./openImport";
import { requireImportAccess } from "./requireImportAccess";
import { attachSlackPhotos, readStoredSlackPhotos } from "./slackPhotos";

/**
 * Reads the connected Slack workspace into the import: the first time and on every
 * refresh, the Slack source then holds its current members with the photos Slack
 * downloaded within the read's time budget.
 */
export async function readSlack(context: ImportContext, ctx: SecurityContext): Promise<void> {
  requireImportAccess(ctx);
  // Slack is read before the transaction, which never waits on another service.
  const { workspace, members, isStillCurrent } = await context.slack.readSlackMembers(ctx, {
    knownPhotos: await readStoredSlackPhotos(context.orm),
  });
  const records = mapSlackMembers(members);
  const stored = await context.transact(async (tx) => {
    // A connect since the read stored another connection; its members are read next time.
    if (!(await isStillCurrent(tx))) {
      return;
    }
    const imports = await openImport(tx);
    // A read that outlived Approve finds the import closed and must not bring it back.
    if (!imports) {
      return;
    }
    const sourceId = await imports.saveSlackSource(workspace.name);
    await imports.syncEmployeeRecords(sourceId, records);
    const photos = await attachSlackPhotos(tx, sourceId, members);
    return { sourceId, photos };
  });
  if (stored) {
    for (const photo of stored.photos) {
      context.logger.info({ sourceId: stored.sourceId, ...photo }, "Stored a Slack photo");
    }
  }
}
