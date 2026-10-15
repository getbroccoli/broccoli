import type { Decisions } from "../../../../core/ai/decisions";
import type { JobQueue } from "../../../../core/jobs";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { SecurityContext } from "../../../../core/security";
import { importRepository } from "../../db";
import { approveImport } from "./approveImport";
import type { SlackReader } from "./importContext";
import { createImportReadService } from "./importReadService";
import { type MapFileJob, mapFile, markFileFailed } from "./mapFile";
import { readSlack } from "./readSlack";
import { removeFile } from "./removeFile";
import { retryFile } from "./retryFile";
import { skipImport } from "./skipImport";
import { type UploadedFile, uploadFile } from "./uploadFile";

export type { SlackReader } from "./importContext";
export type { MapFileJob } from "./mapFile";

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
  const context = { orm, transact, logger, slack, decisions, jobs, imports };
  return {
    readSlack: (ctx: SecurityContext) => readSlack(context, ctx),
    skipImport: (ctx: SecurityContext) => skipImport(context, ctx),
    approveImport: (ctx: SecurityContext) => approveImport(context, ctx),
    uploadFile: (ctx: SecurityContext, file: UploadedFile) => uploadFile(context, ctx, file),
    mapFile: (ctx: SecurityContext, job: MapFileJob) => mapFile(context, ctx, job),
    markFileFailed: (ctx: SecurityContext, job: MapFileJob) => markFileFailed(context, ctx, job),
    retryFile: (ctx: SecurityContext, sourceId: string) => retryFile(context, ctx, sourceId),
    removeFile: (ctx: SecurityContext, sourceId: string) => removeFile(context, ctx, sourceId),
    /** Whether files can be added: the instance has a model key. */
    canReadFiles: (ctx: SecurityContext): boolean => {
      ctx.requireOwnerOrSystem();
      return decisions !== null;
    },
    ...createImportReadService(imports),
  };
}

export type ImportUseCases = ReturnType<typeof createImportUseCases>;
