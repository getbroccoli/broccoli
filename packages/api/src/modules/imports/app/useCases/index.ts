import type { Decisions, ReferenceCompletions } from "../../../../integrations/ai";
import type { JobQueue } from "../../../../core/jobs";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { SecurityContext } from "../../../../core/security";
import { importPhotoRepository, importRepository } from "../../db";
import { createPdfExtractor } from "../../pdfExtraction";
import { approveImport } from "./approveImport";
import { createEmployeeChoiceService, type EmployeeChoiceService } from "./employeeChoiceService";
import { createFileSourceService, type FileSourceService } from "./fileSourceService";
import type { DemoFill, SlackReader } from "./importContext";
import { createImportReadService, type ImportReadService } from "./importReadService";
import { finishImport } from "./finishImport";
import { readSlack } from "./readSlack";
import { resetSetup } from "./resetSetup";
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
  /** Takes setup from the owner step back to the company step, deleting the approved employees. */
  resetSetup: (ctx: SecurityContext) => Promise<void>;
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
  completions,
  pdfRunDeadlineMs,
  jobs,
  clock = () => new Date(),
  prepareDemoFill,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  slack: SlackReader;
  decisions: Decisions;
  /** The model that reads PDFs, through masked evidence only. */
  completions: ReferenceCompletions;
  /** How long one PDF extraction may take; tests shorten it. */
  pdfRunDeadlineMs?: number;
  jobs: JobQueue;
  clock?: () => Date;
  prepareDemoFill: () => Promise<DemoFill>;
}): ImportUseCases {
  const imports = importRepository(orm);
  const context = { orm, transact, logger, slack, imports, clock, prepareDemoFill };
  return {
    readSlack: (ctx: SecurityContext) => readSlack(context, ctx),
    startDemo: (ctx: SecurityContext) => startDemo(context, ctx),
    approveImport: (ctx: SecurityContext) => approveImport(context, ctx),
    finishImport: (ctx: SecurityContext) => finishImport(context, ctx),
    resetSetup: (ctx: SecurityContext) => resetSetup(context, ctx),
    reads: createImportReadService(imports, importPhotoRepository(orm)),
    choices: createEmployeeChoiceService(transact),
    files: createFileSourceService({
      orm,
      transact,
      logger,
      decisions,
      pdfExtractor: createPdfExtractor({ completions, runDeadlineMs: pdfRunDeadlineMs }),
      jobs,
    }),
  };
}
