import type { SecurityContext } from "../../../../core/security";
import { importReader } from "../../db";
import type { ImportContext } from "./importContext";
import { lockOpenImport } from "./openImport";
import { requireImportAccess } from "./requireImportAccess";

/**
 * Removes a source with its records, their photos and its stored file; other sources stay.
 * Removing Slack also disconnects it, so it is not read back in.
 */
export async function removeSource(
  context: ImportContext,
  ctx: SecurityContext,
  sourceId: string,
): Promise<void> {
  requireImportAccess(ctx);
  await context.transact(async (tx) => {
    const [source] = await importReader(tx).findSources([sourceId]);
    // Before the import's lock, in the order a Slack read takes them.
    if (source?.kind === "slack") {
      await context.slack.disconnectSlack(ctx, tx);
    }
    const imports = await lockOpenImport(tx);
    await imports.deleteSource(sourceId);
  });
}
