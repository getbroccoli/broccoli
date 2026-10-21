import { type Decisions, DecisionsError } from "../../../../integrations/ai";
import type { Orm, Transact } from "../../../../core/db";
import { readFile } from "../../../../core/files";
import type { JobQueue } from "../../../../core/jobs";
import type { SecurityContext } from "../../../../core/security";
import { importReader } from "../../db";
import {
  type ColumnMapping,
  columnQuestions,
  type FileSource,
  headerQuestion,
  inSheet,
  type ImportSourceFailure,
  type IncomingRecord,
  type MappingOutcome,
  readColumnMapping,
  readFileRecords,
  readHeaderRow,
  type FileSheet,
  type Sheet,
  sheetQuestions,
} from "../../domain";
import type { UploadReader } from "./uploadReader";
import { readStaffFile } from "./staffFile";
import { lockOpenImport, openImport } from "./openImport";
import { requireImportAccess } from "./requireImportAccess";

/**
 * Staff files as import sources, through their life: upload, mapping in the background,
 * retry and removal. Every function checks `ctx`.
 */
export interface FileSourceService {
  /**
   * Adds a CSV or Excel file as a source and queues its mapping, in one transaction, or a PDF
   * waiting for the owner's consent; returns the source's id. A file that cannot be read is
   * refused and nothing is stored.
   */
  uploadFile(ctx: SecurityContext, file: UploadedFile): Promise<string>;
  /**
   * The job: for each sheet, the model finds the header row and the columns, code copies
   * the cells into records. A run that is no longer current, or of a closed import, writes
   * nothing; a retryable model failure rejects, so the job runs again.
   */
  mapFile(ctx: SecurityContext, job: MapFileJob): Promise<void>;
  /** After the job's last attempt: the file is marked failed, unless a newer run has started. */
  markFileFailed(ctx: SecurityContext, job: MapFileJob): Promise<void>;
  /**
   * Maps a failed file again, in a new run, or has Broccoli's model map a file still waiting for
   * the external agent's answers; any other source is left as it is.
   */
  retryFile(ctx: SecurityContext, sourceId: string): Promise<void>;
  /** Removes a file source, its records and the stored file; other sources stay. */
  removeFile(ctx: SecurityContext, sourceId: string): Promise<void>;
}

/** A staff file as the owner uploads it. */
export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

/** One mapping run of a file source. */
export interface MapFileJob {
  sourceId: string;
  attempt: number;
}

declare module "../../../../core/jobs" {
  interface Jobs {
    "imports.mapFile": MapFileJob;
  }
}

export function createFileSourceService({
  orm,
  transact,
  decisions,
  jobs,
  readUpload,
}: {
  orm: Orm;
  transact: Transact;
  /** The model that maps files. */
  decisions: Decisions;
  jobs: JobQueue;
  /** Shared with every other way of uploading a staff file. */
  readUpload: UploadReader;
}): FileSourceService {
  return {
    uploadFile: async (ctx, { name, bytes }) => {
      requireImportAccess(ctx);
      const { mimeType, sheets } = await readUpload({ name, bytes });
      return transact(async (tx) => {
        const imports = await lockOpenImport(tx);
        const sourceId = await imports.insertFileSource(
          name,
          "parsed_by_broccoli",
          { content: Buffer.from(bytes), mimeType },
          sheets ? "mapping" : "waiting_for_original_read_consent",
        );
        if (sheets) {
          await jobs.send(tx, "imports.mapFile", { sourceId, attempt: 0 });
        }
        return sourceId;
      });
    },

    mapFile: async (ctx, { sourceId, attempt }) => {
      requireImportAccess(ctx);
      const source = await importReader(orm).findFileSource(sourceId);
      if (!isCurrentRun(source, attempt)) {
        return;
      }
      const file = await readFile(orm, source.fileId);
      const sheets = file && (await readStaffFile(file.content));
      if (!sheets || typeof sheets === "string") {
        // Upload read the same bytes, so only a changed file gets here.
        throw new Error(`File source ${sourceId} cannot be read`);
      }
      const { outcome, records } = await mapFileOrFail(decisions, sheets);
      await transact(async (tx) => {
        // Only the current run of an open import writes.
        const imports = await openImport(tx);
        if (imports && (await imports.finishMapping(sourceId, attempt, outcome))) {
          await imports.syncEmployeeRecords(sourceId, records);
        }
      });
    },

    markFileFailed: async (ctx, { sourceId, attempt }) => {
      requireImportAccess(ctx);
      await transact(async (tx) => {
        const imports = await openImport(tx);
        await imports?.finishMapping(sourceId, attempt, {
          status: "failed",
          failure: "unavailable",
        });
      });
    },

    retryFile: async (ctx, sourceId) => {
      requireImportAccess(ctx);
      await transact(async (tx) => {
        const imports = await lockOpenImport(tx);
        // A file still waiting for the external agent's answers goes to Broccoli's model instead.
        const attempt = await imports.restartMapping(sourceId);
        if (attempt !== null) {
          await jobs.send(tx, "imports.mapFile", { sourceId, attempt });
        }
      });
    },

    removeFile: async (ctx, sourceId) => {
      requireImportAccess(ctx);
      await transact(async (tx) => {
        const imports = await lockOpenImport(tx);
        await imports.deleteFileSource(sourceId);
      });
    },
  };
}

type MappingResult = { outcome: MappingOutcome; records: IncomingRecord[] };

function isCurrentRun(source: FileSource | null, attempt: number): source is FileSource {
  return source?.status === "mapping" && source.mappingAttempt === attempt;
}

/** Broccoli AI's refusals that only the owner's own key can get past. */
const AI_REFUSAL_FAILURES = new Map<string, ImportSourceFailure>([
  ["free_period_used", "ai_free_period_used"],
  ["free_period_over", "ai_free_period_over"],
  ["limit_reached", "ai_limit_reached"],
]);

/** A model failure that retrying cannot fix fails the file; any other error is thrown. */
async function mapFileOrFail(decisions: Decisions, sheets: FileSheet[]): Promise<MappingResult> {
  try {
    return await mapSheets(decisions, sheets);
  } catch (error) {
    if (!(error instanceof DecisionsError) || error.retryable) {
      throw error;
    }
    const aiRefusal = AI_REFUSAL_FAILURES.get(error.reason ?? "");
    return {
      outcome: aiRefusal
        ? { status: "failed", failure: aiRefusal }
        : { status: "failed", failure: "unavailable", failureMessage: error.providerMessage },
      records: [],
    };
  }
}

/**
 * Maps each sheet on its own, one after another, since sheets may lay out their columns
 * differently. A sheet without people is skipped; the file fails only when every sheet does.
 */
async function mapSheets(decisions: Decisions, sheets: FileSheet[]): Promise<MappingResult> {
  const records: IncomingRecord[] = [];
  let mapped = false;
  for (const { name, rows } of sheets) {
    const sheetRecords = await mapSheet(decisions, rows);
    if (sheetRecords === null) {
      continue;
    }
    mapped = true;
    records.push(...inSheet(name, sheetRecords));
  }
  return mapped
    ? { outcome: { status: "mapped" }, records }
    : { outcome: { status: "failed", failure: "no_people_columns" }, records: [] };
}

/**
 * The sheet's records, or null when it has no people columns. Asks the model outside any
 * transaction, which never waits on another service: first everything in one request; when
 * an answer is unsure, the header and then the columns under it, which gives the model the
 * header's text and the cells below it.
 */
async function mapSheet(decisions: Decisions, sheet: Sheet): Promise<IncomingRecord[] | null> {
  const { headerRow, mapping } =
    (await mapInOneRequest(decisions, sheet)) ?? (await mapHeaderThenColumns(decisions, sheet));
  return mapping === null ? null : readFileRecords(sheet, headerRow, mapping);
}

/** The header row and the columns, each null when the model found none. */
interface SheetMapping {
  headerRow: number | null;
  mapping: ColumnMapping | null;
}

/** Null when any answer is unsure. */
async function mapInOneRequest(decisions: Decisions, sheet: Sheet): Promise<SheetMapping | null> {
  const { state, questions } = sheetQuestions(sheet);
  const answers = await decisions.decide(state, questions);
  if (Object.values(answers).includes(null)) {
    return null;
  }
  return { headerRow: readHeaderRow(answers), mapping: readColumnMapping(answers) };
}

async function mapHeaderThenColumns(decisions: Decisions, sheet: Sheet): Promise<SheetMapping> {
  const header = headerQuestion(sheet);
  // No header row: the columns are read from their cells alone.
  const headerRow = readHeaderRow(await decisions.decide(header.state, header.questions));
  const columns = columnQuestions(sheet, headerRow);
  return {
    headerRow,
    mapping: readColumnMapping(await decisions.decide(columns.state, columns.questions)),
  };
}
