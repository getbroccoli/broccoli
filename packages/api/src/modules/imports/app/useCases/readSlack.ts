import { deleteFiles } from "../../../../core/files";
import { isImportOpen } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { importPhotoRepository, importRepository } from "../../db";
import type { ImportContext } from "./importContext";
import { mapSlackMembers } from "./mapSlackMembers";
import { requireImportAccess } from "./requireImportAccess";
import { downloadFirstSlackPhotos } from "./slackPhotos";

/**
 * Reads the connected Slack workspace into the import: the first time and on every
 * refresh, the Slack source then holds its current members, and the first of their
 * photos are downloaded.
 */
export async function readSlack(context: ImportContext, ctx: SecurityContext): Promise<void> {
  requireImportAccess(ctx);
  // Slack is read before the transaction, which never waits on another service.
  const { workspace, members, snapshot } = await context.slack.readSlackMembers(ctx);
  const records = mapSlackMembers(members);
  const sourceId = await context.transact(async (tx) => {
    // A connect since the read stored another connection; its members are read next time.
    if (!(await context.slack.isCurrentSlackConnection(ctx, tx, snapshot))) {
      return null;
    }
    const imports = importRepository(tx);
    await imports.lockSources();
    // A read that outlived Approve finds the import gone and must not bring it back.
    if (!(await isImportOpen(tx))) {
      return null;
    }
    const sourceId = await imports.saveSlackSource(workspace.name);
    await deleteFiles(tx, await importPhotoRepository(tx).detachReplacedPhotos(sourceId, records));
    await imports.syncEmployeeRecords(sourceId, records);
    return sourceId;
  });
  if (sourceId) {
    await downloadFirstSlackPhotos(context, ctx, sourceId);
  }
}
