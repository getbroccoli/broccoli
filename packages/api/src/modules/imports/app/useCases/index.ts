import type { Decisions } from "../../../../integrations/ai";
import type { JobQueue } from "../../../../core/jobs";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { SecurityContext } from "../../../../core/security";
import { importRepository } from "../../db";
import { approveImport } from "./approveImport";
import { createEmployeeChoiceService, type EmployeeChoiceService } from "./employeeChoiceService";
import { createFileSourceService, type FileSourceService } from "./fileSourceService";
import type { SlackReader } from "./importContext";
import { createImportReadService, type ImportReadService } from "./importReadService";
import { readSlack } from "./readSlack";
import { skipImport } from "./skipImport";

export type { SlackReader } from "./importContext";

/** Everything that can be done with the import; the adapters call nothing else. */
export interface ImportUseCases {
  readSlack: (ctx: SecurityContext) => Promise<void>;
  skipImport: (ctx: SecurityContext) => Promise<void>;
  approveImport: (ctx: SecurityContext) => Promise<void>;
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
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  slack: SlackReader;
  decisions: Decisions | null;
  jobs: JobQueue;
}): ImportUseCases {
  const imports = importRepository(orm);
  const context = { transact, logger, slack, imports };
  return {
    readSlack: (ctx: SecurityContext) => readSlack(context, ctx),
    skipImport: (ctx: SecurityContext) => skipImport(context, ctx),
    approveImport: (ctx: SecurityContext) => approveImport(context, ctx),
    reads: createImportReadService(imports),
    choices: createEmployeeChoiceService(transact),
    files: createFileSourceService({ orm, transact, decisions, jobs }),
  };
}
