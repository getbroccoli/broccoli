import type { Decisions } from "../../../../core/ai/decisions";
import type { JobQueue } from "../../../../core/jobs";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { SecurityContext } from "../../../../core/security";
import { importRepository } from "../../db";
import { approveImport } from "./approveImport";
import { createFileSourceService } from "./fileSourceService";
import type { SlackReader } from "./importContext";
import { createImportReadService } from "./importReadService";
import { readSlack } from "./readSlack";
import { skipImport } from "./skipImport";

export type { SlackReader } from "./importContext";

/** Everything that can be done with the import; the adapters call nothing else. */
export function createImportUseCases({
  orm,
  transact,
  logger,
  slack,
  decisions,
  jobs,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  slack: SlackReader;
  decisions: Decisions | null;
  jobs: JobQueue;
}) {
  const imports = importRepository(orm);
  const context = { transact, logger, slack, imports };
  return {
    readSlack: (ctx: SecurityContext) => readSlack(context, ctx),
    skipImport: (ctx: SecurityContext) => skipImport(context, ctx),
    approveImport: (ctx: SecurityContext) => approveImport(context, ctx),
    ...createFileSourceService({ orm, transact, decisions, jobs }),
    ...createImportReadService(imports),
  };
}

export type ImportUseCases = ReturnType<typeof createImportUseCases>;
