import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import type { SlackConnectionService } from "../../slack";
import { importReader } from "../db";
import { mapSlackMembers } from "./mapSlackMembers";
import { lockOpenImport, openImport } from "./openImport";
import { requireImportAccess } from "./requireImportAccess";
import { attachSlackPhotos, readStoredSlackPhotos } from "./slackPhotos";

/** What the Slack module offers the import. */
export type ImportSlack = Pick<SlackConnectionService, "readSlackMembers" | "disconnectSlack">;

/** The sources that deliver records to the import: the Slack workspace, and removing any source. */
export interface ImportSourceService {
  /**
   * Reads the connected Slack workspace into the import: the first time and on every
   * refresh, the Slack source then holds its current members with the photos Slack
   * downloaded within the read's time budget.
   */
  readSlack: (ctx: SecurityContext) => Promise<void>;
  /**
   * Removes a file or the Slack source with its records, their photos and its stored file;
   * other sources stay. Removing Slack also disconnects it, so it is not read back in.
   * Refused once approved.
   */
  removeSource: (ctx: SecurityContext, sourceId: string) => Promise<void>;
}

export function createImportSourceService({
  orm,
  transact,
  logger,
  slack,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  slack: ImportSlack;
}): ImportSourceService {
  return {
    async readSlack(ctx) {
      requireImportAccess(ctx);
      // Slack is read before the transaction, which never waits on another service.
      const { workspace, members, isStillCurrent } = await slack.readSlackMembers(ctx, {
        knownPhotos: await readStoredSlackPhotos(orm),
      });
      const records = mapSlackMembers(members);
      const stored = await transact(async (tx) => {
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
          logger.info({ sourceId: stored.sourceId, ...photo }, "Stored a Slack photo");
        }
      }
    },
    async removeSource(ctx, sourceId) {
      requireImportAccess(ctx);
      await transact(async (tx) => {
        const [source] = await importReader(tx).findSources([sourceId]);
        // Before the import's lock, in the order a Slack read takes them.
        if (source?.kind === "slack") {
          await slack.disconnectSlack(ctx, tx);
        }
        const imports = await lockOpenImport(tx);
        await imports.deleteSource(sourceId);
      });
    },
  };
}
