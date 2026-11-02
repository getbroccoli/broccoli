import type { Decisions } from "../../../integrations/ai";
import type { OriginalFileReader } from "../../../core/instance";
import type { JobQueue } from "../../../core/jobs";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import { createEmployeeChoiceService, type EmployeeChoiceService } from "./employeeChoiceService";
import { createFileSourceService, type FileSourceService } from "./fileSourceService";
import { createImportApprovalService, type ImportApprovalService } from "./importApprovalService";
import {
  createImportDemoService,
  type DemoFill,
  type ImportDemoService,
} from "./importDemoService";
import {
  createImportLifecycleService,
  type ImportLifecycleService,
} from "./importLifecycleService";
import { createImportReadService, type ImportReadService } from "./importReadService";
import {
  createImportSourceService,
  type ImportSlack,
  type ImportSourceService,
} from "./importSourceService";
import { createUploadReader } from "./uploadReader";
import {
  type AnsweredMappingService,
  createAnsweredMappingService,
} from "./answeredMappingService";
import {
  createOriginalFileReadService,
  type OriginalFileReadService,
} from "./originalFileReadService";

export type { ImportReview } from "./importReview";
export { READ_PEOPLE_JSON_SCHEMA, type ReadPeopleOutcome } from "./originalFileReadService";

/** The import's services, built once; the adapters and the external agent call nothing else. */
export type ImportServices = ImportSourceService &
  ImportApprovalService &
  ImportLifecycleService &
  ImportDemoService & {
    reads: ImportReadService;
    choices: EmployeeChoiceService;
    files: FileSourceService;
    /** Staff files mapped by the external agent's answers to Broccoli's masked questions. */
    answeredMapping: AnsweredMappingService;
    /** Staff files AI reads in full, personal data included, once the owner allowed it. */
    originalFileReads: OriginalFileReadService;
  };

export function createImportServices({
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
}): ImportServices {
  const readUpload = createUploadReader();
  return {
    ...createImportSourceService({ orm, transact, logger, slack }),
    ...createImportApprovalService({ transact, logger }),
    ...createImportLifecycleService({ transact, logger }),
    ...createImportDemoService({ transact, prepareDemoFill }),
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
