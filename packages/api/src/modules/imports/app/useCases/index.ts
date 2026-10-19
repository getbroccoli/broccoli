import type { Decisions } from "../../../../integrations/ai";
import type { JobQueue } from "../../../../core/jobs";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { SecurityContext } from "../../../../core/security";
import { importPhotoRepository, importRepository } from "../../db";
import { approveImport } from "./approveImport";
import { createEmployeeChoiceService, type EmployeeChoiceService } from "./employeeChoiceService";
import { createFileSourceService, type FileSourceService } from "./fileSourceService";
import type { DemoFill, SlackReader } from "./importContext";
import { createImportReadService, type ImportReadService } from "./importReadService";
import { finishImport } from "./finishImport";
import { readSlack } from "./readSlack";
import { downloadSlackPhotos, type SlackPhotoJob } from "./slackPhotos";
import { startDemo } from "./startDemo";

export type { DemoFill, SlackReader } from "./importContext";
export { prepareDemoStart } from "./startDemo";

/** Everything that can be done with the import; the adapters call nothing else. */
export interface ImportUseCases {
  readSlack: (ctx: SecurityContext) => Promise<void>;
  startDemo: (ctx: SecurityContext) => Promise<void>;
  approveImport: (ctx: SecurityContext) => Promise<void>;
  /** Deletes the approved import once setup is complete; its photos stay with the employees. */
  finishImport: (ctx: SecurityContext) => Promise<void>;
  /** The photo job's run: downloads the source's photos still missing, a batch at a time. */
  downloadSlackPhotos: (ctx: SecurityContext, job: SlackPhotoJob) => Promise<void>;
  reads: ImportReadService;
  choices: EmployeeChoiceService;
  files: FileSourceService;
}

export function createImportUseCases({
  orm,
  transact,
  logger,
  slack,
  decisions,
  jobs,
  prepareDemoFill,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  slack: SlackReader;
  decisions: Decisions;
  jobs: JobQueue;
  prepareDemoFill: () => Promise<DemoFill>;
}): ImportUseCases {
  const imports = importRepository(orm);
  const context = { orm, transact, logger, slack, imports, jobs, prepareDemoFill };
  return {
    readSlack: (ctx: SecurityContext) => readSlack(context, ctx),
    startDemo: (ctx: SecurityContext) => startDemo(context, ctx),
    approveImport: (ctx: SecurityContext) => approveImport(context, ctx),
    finishImport: (ctx: SecurityContext) => finishImport(context, ctx),
    downloadSlackPhotos: (ctx: SecurityContext, job: SlackPhotoJob) =>
      downloadSlackPhotos(context, ctx, job),
    reads: createImportReadService(imports, importPhotoRepository(orm)),
    choices: createEmployeeChoiceService(transact),
    files: createFileSourceService({ orm, transact, decisions, jobs }),
  };
}
