import { DecisionsError, type Decisions } from "../../../../core/ai/decisions";
import { readFile } from "../../../../core/files";
import type { SecurityContext } from "../../../../core/security";
import { importRepository } from "../../db";
import {
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
} from "../../domain";
import type { ImportContext } from "./importContext";

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

/**
 * Maps a file source: the model finds the header row and the columns, code copies the
 * cells into records. A run that is no longer current writes nothing. A retryable model
 * failure rejects, so the job runs again.
 */
export async function mapFile(
  { orm, transact, decisions, imports }: ImportContext,
  ctx: SecurityContext,
  { sourceId, attempt }: MapFileJob,
): Promise<void> {
  ctx.requireOwnerOrSystem();
  const source = await imports.findFileSource(sourceId);
  if (!isCurrentRun(source, attempt) || decisions === null) {
    return;
  }
  const file = await readFile(orm, source.fileId);
  const sheet = file && readSheet(file.content);
  if (!sheet || typeof sheet === "string") {
    // Upload read the same bytes, so only a changed file gets here.
    throw new Error(`File source ${sourceId} cannot be read`);
  }
  let result: { outcome: MappingOutcome; records: IncomingRecord[] };
  try {
    result = await mapSheet(decisions, sheet);
  } catch (error) {
    if (!(error instanceof DecisionsError) || error.retryable) {
      throw error;
    }
    result = { outcome: { status: "failed", failure: "unavailable" }, records: [] };
  }
  await transact(async (tx) => {
    const repository = importRepository(tx);
    if (await repository.finishMapping(sourceId, attempt, result.outcome)) {
      await repository.syncEmployeeRecords(sourceId, result.records);
    }
  });
}

/** After the last attempt: the file is marked failed, unless a newer run has started. */
export async function markFileFailed(
  { transact }: ImportContext,
  ctx: SecurityContext,
  { sourceId, attempt }: MapFileJob,
): Promise<void> {
  ctx.requireOwnerOrSystem();
  await transact((tx) =>
    importRepository(tx).finishMapping(sourceId, attempt, {
      status: "failed",
      failure: "unavailable",
    }),
  );
}

function isCurrentRun(source: FileSource | null, attempt: number): source is FileSource {
  return source?.status === "mapping" && source.mappingAttempt === attempt;
}

/** The two model calls; outside any transaction, which never waits on another service. */
async function mapSheet(
  decisions: Decisions,
  sheet: Sheet,
): Promise<{ outcome: MappingOutcome; records: IncomingRecord[] }> {
  const header = headerQuestion(sheet);
  const headerRow = readHeaderRow(await decisions.decide(header.state, header.questions));
  if (headerRow === null) {
    return { outcome: { status: "failed", failure: "no_header" }, records: [] };
  }
  const columns = columnQuestions(sheet, headerRow);
  const mapping = readColumnMapping(await decisions.decide(columns.state, columns.questions));
  if (mapping === null) {
    return { outcome: { status: "failed", failure: "no_people_columns" }, records: [] };
  }
  return {
    outcome: { status: "mapped" },
    records: readFileRecords(sheet, headerRow, mapping),
  };
}
