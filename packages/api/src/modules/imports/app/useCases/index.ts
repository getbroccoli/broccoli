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
import { resetSetup } from "./resetSetup";
import { startDemo } from "./startDemo";
import { createUploadReader } from "./uploadReader";
import {
  type AnsweredMappingService,
  createAnsweredMappingService,
} from "./answeredMappingService";
import { createParsedSourceService, type ParsedSourceService } from "./parsedSourceService";

export type { DemoFill, SlackReader } from "./importContext";
export type { AnsweredSourceSummary, MappingQuestions } from "./answeredMappingService";
export { prepareDemoStart } from "./startDemo";

/** Everything that can be done with the import; the adapters call nothing else. */
export interface ImportUseCases {
  readSlack: (ctx: SecurityContext) => Promise<void>;
  startDemo: (ctx: SecurityContext) => Promise<void>;
  /** Approve of the import the owner reviewed, as `reads.readVersion` gave it. */
  approveImport: (ctx: SecurityContext, version: string) => Promise<void>;
  /** Deletes the approved import once setup is complete; its photos stay with the employees. */
  finishImport: (ctx: SecurityContext) => Promise<void>;
  /** Takes setup from the owner step back to the company step, deleting the approved employees. */
  resetSetup: (ctx: SecurityContext) => Promise<void>;
  reads: ImportReadService;
  choices: EmployeeChoiceService;
  files: FileSourceService;
  /** Staff files mapped by the external agent's answers to Broccoli's masked questions. */
  answeredMapping: AnsweredMappingService;
  /** Staff files whose people the external agent parsed itself. */
  parsedSources: ParsedSourceService;
}

export function createImportUseCases({
  orm,
  transact,
  logger,
  slack,
  decisions,
  jobs,
  clock = () => new Date(),
  prepareDemoFill,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  slack: SlackReader;
  decisions: Decisions;
  jobs: JobQueue;
  clock?: () => Date;
  prepareDemoFill: () => Promise<DemoFill>;
}): ImportUseCases {
  const imports = importRepository(orm);
  const readUpload = createUploadReader();
  const context = { orm, transact, logger, slack, imports, clock, prepareDemoFill };
  return {
    readSlack: (ctx: SecurityContext) => readSlack(context, ctx),
    startDemo: (ctx: SecurityContext) => startDemo(context, ctx),
    approveImport: (ctx: SecurityContext, version: string) => approveImport(context, ctx, version),
    finishImport: (ctx: SecurityContext) => finishImport(context, ctx),
    resetSetup: (ctx: SecurityContext) => resetSetup(context, ctx),
    reads: createImportReadService(orm, imports, importPhotoRepository(orm)),
    choices: createEmployeeChoiceService(transact),
    files: createFileSourceService({ orm, transact, decisions, jobs, readUpload }),
    answeredMapping: createAnsweredMappingService(readUpload),
    parsedSources: createParsedSourceService(),
  };
}
