import type { Tx } from "../../../../core/db";
import type { Decisions } from "../../../../integrations/ai";
import type { OriginalFileReader } from "../../../../core/instance";
import type { JobQueue } from "../../../../core/jobs";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { AddApprovedPeople, DemoStart } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { type AddedPeople, addApprovedPeople, reportAddedPeople } from "./addApprovedPeople";
import { approveImport } from "./approveImport";
import { createEmployeeChoiceService, type EmployeeChoiceService } from "./employeeChoiceService";
import { createFileSourceService, type FileSourceService } from "./fileSourceService";
import type { DemoFill, ImportSlack } from "./importContext";
import { createImportReadService, type ImportReadService } from "./importReadService";
import { deleteFinishedImport, finishImport } from "./deleteImport";
import { readSlack } from "./readSlack";
import { removeSource } from "./removeSource";
import { reopenReview } from "./reopenReview";
import { prepareDemoStart, startDemo } from "./startDemo";
import { createUploadReader } from "./uploadReader";
import {
  type AnsweredMappingService,
  createAnsweredMappingService,
} from "./answeredMappingService";
import {
  createOriginalFileReadService,
  type OriginalFileReadService,
} from "./originalFileReadService";

export type { DemoFill, ImportSlack } from "./importContext";
export type { ImportReview } from "./importReview";
export type { StaffUpload } from "./uploadReader";
export { READ_PEOPLE_JSON_SCHEMA, type ReadPeopleOutcome } from "./originalFileReadService";

/** Import commands and services grouped by subject; the adapters call nothing else. */
export interface ImportUseCases {
  readSlack: (ctx: SecurityContext) => Promise<void>;
  /** Removes a file or the Slack source, disconnecting Slack; refused once approved. */
  removeSource: (ctx: SecurityContext, sourceId: string) => Promise<void>;
  startDemo: (ctx: SecurityContext) => Promise<void>;
  /** The demo start for setup's demo: prepared outside any transaction, run in the caller's. */
  prepareDemoStart: () => Promise<DemoStart>;
  /** Approve of the import the owner reviewed, at the `version` of `reads.readReview`. */
  approveImport: (ctx: SecurityContext, version: string) => Promise<void>;
  /** Adds the approved people in the caller's transaction, which completes setup. */
  addApprovedPeople: AddApprovedPeople;
  /** Logs the people added once they are committed. */
  reportAddedPeople: (added: AddedPeople) => void;
  /** Deletes the approved import once setup is complete; its photos stay with the employees. */
  finishImport: (ctx: SecurityContext) => Promise<void>;
  /** Deletes what is left of the approved import in the caller's transaction, when setup is reset. */
  deleteFinishedImport: (ctx: SecurityContext, tx: Tx) => Promise<void>;
  /** Takes setup from its last step back to the review, so the owner can change it. */
  reopenReview: (ctx: SecurityContext) => Promise<void>;
  reads: ImportReadService;
  choices: EmployeeChoiceService;
  files: FileSourceService;
  /** Staff files mapped by the external agent's answers to Broccoli's masked questions. */
  answeredMapping: AnsweredMappingService;
  /** Staff files AI reads in full, personal data included, once the owner allowed it. */
  originalFileReads: OriginalFileReadService;
}

export function createImportUseCases({
  orm,
  transact,
  logger,
  slack,
  decisions,
  originalFileReader,
  jobs,
  prepareDemoFill,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  slack: ImportSlack;
  decisions: Decisions;
  originalFileReader: OriginalFileReader;
  jobs: JobQueue;
  prepareDemoFill: () => Promise<DemoFill>;
}): ImportUseCases {
  const readUpload = createUploadReader();
  const context = { orm, transact, logger, slack, prepareDemoFill };
  return {
    readSlack: (ctx: SecurityContext) => readSlack(context, ctx),
    removeSource: (ctx: SecurityContext, sourceId: string) => removeSource(context, ctx, sourceId),
    startDemo: (ctx: SecurityContext) => startDemo(context, ctx),
    prepareDemoStart: () => prepareDemoStart(context),
    approveImport: (ctx: SecurityContext, version: string) => approveImport(context, ctx, version),
    addApprovedPeople,
    reportAddedPeople: (added: AddedPeople) => reportAddedPeople(context, added),
    finishImport: (ctx: SecurityContext) => finishImport(context, ctx),
    deleteFinishedImport: async (ctx: SecurityContext, tx: Tx) => {
      await deleteFinishedImport(ctx, tx);
    },
    reopenReview: (ctx: SecurityContext) => reopenReview(context, ctx),
    reads: createImportReadService(orm),
    choices: createEmployeeChoiceService(transact),
    files: createFileSourceService({ orm, transact, decisions, jobs, readUpload, logger }),
    answeredMapping: createAnsweredMappingService(readUpload),
    originalFileReads: createOriginalFileReadService({
      orm,
      transact,
      jobs,
      originalFileReader,
      logger,
    }),
  };
}
