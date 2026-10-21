import type { Decisions } from "../../../../integrations/ai";
import type { JobQueue } from "../../../../core/jobs";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { StoredFile } from "../../../../core/files";
import type { SecurityContext } from "../../../../core/security";
import { approveImport } from "./approveImport";
import { createEmployeeChoiceService, type EmployeeChoiceService } from "./employeeChoiceService";
import { createFileSourceService, type FileSourceService } from "./fileSourceService";
import type { DemoFill, SlackReader } from "./importContext";
import { createImportReadService, type ImportReadService } from "./importReadService";
import { finishImport } from "./deleteImport";
import { readImportPhoto } from "./readImportPhoto";
import { readSlack } from "./readSlack";
import { resetSetup } from "./resetSetup";
import { startDemo } from "./startDemo";
import { createUploadReader } from "./uploadReader";
import {
  type AnsweredMappingService,
  createAnsweredMappingService,
} from "./answeredMappingService";

export type { DemoFill, SlackReader } from "./importContext";
export type { ImportReview } from "./importReview";
export { prepareDemoStart } from "./startDemo";

/** Everything that can be done with the import; the adapters call nothing else. */
export interface ImportUseCases {
  readSlack: (ctx: SecurityContext) => Promise<void>;
  startDemo: (ctx: SecurityContext) => Promise<void>;
  /** Approve of the import the owner reviewed, at the `version` of `reads.readReview`. */
  approveImport: (ctx: SecurityContext, version: string) => Promise<void>;
  /** Deletes the approved import once setup is complete; its photos stay with the employees. */
  finishImport: (ctx: SecurityContext) => Promise<void>;
  /** Takes setup from the owner step back to the company step, deleting the approved employees. */
  resetSetup: (ctx: SecurityContext) => Promise<void>;
  /** The import record's photo with this file id, or null when it is no record's photo. */
  readImportPhoto: (ctx: SecurityContext, fileId: string) => Promise<StoredFile | null>;
  reads: ImportReadService;
  choices: EmployeeChoiceService;
  files: FileSourceService;
  /** Staff files mapped by the external agent's answers to Broccoli's masked questions. */
  answeredMapping: AnsweredMappingService;
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
  const readUpload = createUploadReader();
  const context = { orm, transact, logger, slack, prepareDemoFill };
  return {
    readSlack: (ctx: SecurityContext) => readSlack(context, ctx),
    startDemo: (ctx: SecurityContext) => startDemo(context, ctx),
    approveImport: (ctx: SecurityContext, version: string) => approveImport(context, ctx, version),
    finishImport: (ctx: SecurityContext) => finishImport(context, ctx),
    resetSetup: (ctx: SecurityContext) => resetSetup(context, ctx),
    readImportPhoto: (ctx: SecurityContext, fileId: string) =>
      readImportPhoto(context, ctx, fileId),
    reads: createImportReadService(orm),
    choices: createEmployeeChoiceService(transact),
    files: createFileSourceService({ orm, transact, decisions, jobs, readUpload }),
    answeredMapping: createAnsweredMappingService(readUpload),
  };
}
