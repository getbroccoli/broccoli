import type { Orm } from "../../../core/db";
import type { RecordTypeRegistration } from "../../../core/records";
import { parseUuid } from "../../../utils";
import { processRepository } from "../db";

/** How a process's history is read: by whoever manages the workspace, as for the process. */
export function processRecordType(orm: Orm): RecordTypeRegistration {
  const loadProcesses = async (ids: readonly string[]) =>
    new Map((await processRepository(orm).findProcessesByIds(ids)).map((p) => [p.id, p]));
  return {
    graphqlType: "Process",
    canonicalId: parseUuid,
    loadRecords: loadProcesses,
    readableIds: async (ctx, ids) =>
      ctx.can("MANAGE_WORKSPACE") ? new Set((await loadProcesses(ids)).keys()) : new Set(),
  };
}
