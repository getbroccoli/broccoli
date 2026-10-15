import { type Decisions, DecisionsError } from "../../../../core/ai/decisions";
import { ApplicationError, invalidInput } from "../../../../core/applicationError";
import type { Orm, Transact, Tx } from "../../../../core/db";
import { deleteFiles, readFile, storeFile } from "../../../../core/files";
import { readSetupStep } from "../../../../core/instance";
import type { JobQueue } from "../../../../core/jobs";
import type { SecurityContext } from "../../../../core/security";
import { importRepository, type ImportRepository } from "../../db";
import {
  type ColumnMapping,
  columnQuestions,
  type FileSource,
  headerQuestion,
  type IncomingRecord,
  type MappingOutcome,
  readColumnMapping,
  readFileRecords,
  readHeaderRow,
  readSheet,
  type Sheet,
  sheetQuestions,
} from "../../domain";

/**
 * Staff files as import sources, through their life: upload, mapping in the background,
 * retry and removal. Every function checks `ctx`.
 */
export interface FileSourceService {
  /** Whether files can be added: the instance has a model key. */
  canReadFiles(ctx: SecurityContext): boolean;
  /**
   * Adds a CSV file as a source and queues its mapping, in one transaction; returns the
   * source's id. A file that cannot be read is refused and nothing is stored.
   */
  uploadFile(ctx: SecurityContext, file: UploadedFile): Promise<string>;
  /**
   * The job: the model finds the header row and the columns, code copies the cells into
   * records. A run that is no longer current writes nothing; a retryable model failure
   * rejects, so the job runs again.
   */
  mapFile(ctx: SecurityContext, job: MapFileJob): Promise<void>;
  /** After the job's last attempt: the file is marked failed, unless a newer run has started. */
  markFileFailed(ctx: SecurityContext, job: MapFileJob): Promise<void>;
  /** Maps a failed file again, in a new run; any other source is left as it is. */
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
}: {
  orm: Orm;
  transact: Transact;
  /** The model that maps files; null where the instance has no model key. */
  decisions: Decisions | null;
  jobs: JobQueue;
}): FileSourceService {
  return {
    canReadFiles: (ctx) => {
      ctx.requireOwnerOrSystem();
      return decisions !== null;
    },

    uploadFile: async (ctx, { name, bytes }) => {
      ctx.requireOwnerOrSystem();
      if (decisions === null) {
        throw new ApplicationError("UNAVAILABLE", "Reading files needs a model key.");
      }
      const sheet = readSheet(bytes);
      if (typeof sheet === "string") {
        throw invalidInput([{ field: "file", code: sheet }]);
      }
      return transact(async (tx) => {
        const imports = await lockSourcesForMapping(tx);
        const fileId = await storeFile(tx, { content: Buffer.from(bytes), mimeType: "text/csv" });
        const sourceId = await imports.insertFileSource(name, fileId);
        await jobs.send(tx, "imports.mapFile", { sourceId, attempt: 0 });
        return sourceId;
      });
    },

    mapFile: async (ctx, { sourceId, attempt }) => {
      ctx.requireOwnerOrSystem();
      const source = await importRepository(orm).findFileSource(sourceId);
      if (!isCurrentRun(source, attempt) || decisions === null) {
        return;
      }
      const file = await readFile(orm, source.fileId);
      const sheet = file && readSheet(file.content);
      if (!sheet || typeof sheet === "string") {
        // Upload read the same bytes, so only a changed file gets here.
        throw new Error(`File source ${sourceId} cannot be read`);
      }
      const { outcome, records } = await mapSheetOrFail(decisions, sheet);
      await transact(async (tx) => {
        const imports = importRepository(tx);
        if (await imports.finishMapping(sourceId, attempt, outcome)) {
          await imports.syncEmployeeRecords(sourceId, records);
        }
      });
    },

    markFileFailed: async (ctx, { sourceId, attempt }) => {
      ctx.requireOwnerOrSystem();
      await transact((tx) =>
        importRepository(tx).finishMapping(sourceId, attempt, {
          status: "failed",
          failure: "unavailable",
        }),
      );
    },

    retryFile: async (ctx, sourceId) => {
      ctx.requireOwnerOrSystem();
      await transact(async (tx) => {
        const imports = await lockSourcesForMapping(tx);
        const attempt = await imports.restartMapping(sourceId);
        if (attempt !== null) {
          await jobs.send(tx, "imports.mapFile", { sourceId, attempt });
        }
      });
    },

    removeFile: async (ctx, sourceId) => {
      ctx.requireOwnerOrSystem();
      await transact(async (tx) => {
        const fileId = await importRepository(tx).deleteFileSource(sourceId);
        if (fileId !== null) {
          await deleteFiles(tx, [fileId]);
        }
      });
    },
  };
}

type MappingResult = { outcome: MappingOutcome; records: IncomingRecord[] };

/**
 * Takes the sources lock that Approve takes too, so a new mapping run never slips past
 * it, and refuses one once setup is done: Approve runs only once.
 */
async function lockSourcesForMapping(tx: Tx): Promise<ImportRepository> {
  const imports = importRepository(tx);
  await imports.lockSources();
  if ((await readSetupStep(tx)) === "done") {
    throw new ApplicationError("CONFLICT", "Setup is complete.");
  }
  return imports;
}

function isCurrentRun(source: FileSource | null, attempt: number): source is FileSource {
  return source?.status === "mapping" && source.mappingAttempt === attempt;
}

/** A model failure that retrying cannot fix fails the file; any other error is thrown. */
async function mapSheetOrFail(decisions: Decisions, sheet: Sheet): Promise<MappingResult> {
  try {
    return await mapSheet(decisions, sheet);
  } catch (error) {
    if (!(error instanceof DecisionsError) || error.retryable) {
      throw error;
    }
    return { outcome: { status: "failed", failure: "unavailable" }, records: [] };
  }
}

/**
 * Asks the model outside any transaction, which never waits on another service: first
 * everything in one request; when an answer is unsure, the header and then the columns
 * under it, which gives the model the header's text and the cells below it.
 */
async function mapSheet(decisions: Decisions, sheet: Sheet): Promise<MappingResult> {
  const { headerRow, mapping } =
    (await mapInOneRequest(decisions, sheet)) ?? (await mapHeaderThenColumns(decisions, sheet));
  if (headerRow === null) {
    return { outcome: { status: "failed", failure: "no_header" }, records: [] };
  }
  if (mapping === null) {
    return { outcome: { status: "failed", failure: "no_people_columns" }, records: [] };
  }
  return {
    outcome: { status: "mapped" },
    records: readFileRecords(sheet, headerRow, mapping),
  };
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
  const headerRow = readHeaderRow(await decisions.decide(header.state, header.questions));
  if (headerRow === null) {
    return { headerRow, mapping: null };
  }
  const columns = columnQuestions(sheet, headerRow);
  return {
    headerRow,
    mapping: readColumnMapping(await decisions.decide(columns.state, columns.questions)),
  };
}
