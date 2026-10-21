import { withPlaceholders } from "../../../../integrations/ai";
import { ApplicationError } from "../../../../core/applicationError";
import type { Tx } from "../../../../core/db";
import { readFile } from "../../../../core/files";
import type { SecurityContext } from "../../../../core/security";
import { answeredSourceRepository, type ImportRepository } from "../../db";
import {
  type FileSheet,
  type FileSource,
  type IncomingRecord,
  inSheet,
  type AnsweredMapping,
  type MappingAnswersInput,
  type MappingQuestions,
  parseMappingAnswers,
  readColumnMapping,
  readFileRecords,
  readHeaderRow,
  sheetQuestions,
} from "../../domain";
import { lockOpenImport } from "./openImport";
import { readStaffFile } from "./staffFile";
import { mimeTypeOf, type UploadReader } from "./uploadReader";

/**
 * Staff files mapped by answers to Broccoli's masked questions instead of by its model: the
 * owner uploads them, then the external agent reads the questions and answers them. The
 * composing functions take the caller's `tx` and the sources lock; every function checks `ctx`.
 */
export interface AnsweredMappingService {
  /** Reads a staff file the setup holder uploads; refuses one that cannot be read, storing nothing. */
  readStaffUpload(ctx: SecurityContext, bytes: Uint8Array): Promise<FileSheet[]>;
  /** Stores the file as a source waiting for answers, with no mapping job; returns its id. */
  addAnsweredSource(ctx: SecurityContext, tx: Tx, file: AnsweredFile): Promise<string>;
  /** The sources still waiting for answers, without their names, which may name a person. */
  readUnmappedSources(ctx: SecurityContext, tx: Tx): Promise<{ id: string }[]>;
  /**
   * Per sheet, its first rows as placeholders and the questions Broccoli's model gets; records
   * that the external agent picked the file up.
   */
  readMappingQuestions(ctx: SecurityContext, tx: Tx, sourceId: string): Promise<MappingQuestions>;
  /** Maps the waiting source with these answers, as Broccoli's model's answers would. */
  answerMapping(
    ctx: SecurityContext,
    tx: Tx,
    sourceId: string,
    answers: MappingAnswersInput,
  ): Promise<AnsweredMapping>;
}

/** A staff file the upload reader has read. */
export interface AnsweredFile {
  name: string;
  bytes: Uint8Array;
  sheets: FileSheet[];
}

export function createAnsweredMappingService(readUpload: UploadReader): AnsweredMappingService {
  return {
    readStaffUpload: async (ctx, bytes) => {
      ctx.requireSetupAccess();
      return readUpload(bytes);
    },

    addAnsweredSource: async (ctx, tx, { name, bytes, sheets }) => {
      ctx.requireSetupAccess();
      const imports = await lockOpenImport(tx);
      return imports.insertFileSource(name, "answered_by_external_agent", {
        content: Buffer.from(bytes),
        mimeType: mimeTypeOf(sheets),
      });
    },

    readUnmappedSources: async (ctx, tx) => {
      ctx.requireSetupExternalAgent();
      const imports = await lockOpenImport(tx);
      return (await imports.listSources())
        .filter(
          ({ readBy, status }) => readBy === "answered_by_external_agent" && status === "mapping",
        )
        .map(({ id }) => ({ id }));
    },

    readMappingQuestions: async (ctx, tx, sourceId) => {
      ctx.requireSetupExternalAgent();
      const imports = await lockOpenImport(tx);
      const { source, sheets } = await readAnsweredFile(tx, imports, sourceId);
      if (source.status !== "mapping") {
        throw notWaiting();
      }
      await answeredSourceRepository(tx).recordPickup(sourceId);
      return {
        sheets: sheets.map(({ rows }, index) => {
          const { state, questions } = sheetQuestions(rows);
          return { sheet: index + 1, rows: withPlaceholders(state).rows, questions };
        }),
      };
    },

    answerMapping: async (ctx, tx, sourceId, input) => {
      ctx.requireSetupExternalAgent();
      const imports = await lockOpenImport(tx);
      const { source, sheets } = await readAnsweredFile(tx, imports, sourceId);
      if (source.status !== "mapping") {
        throw new ApplicationError("CONFLICT", "This file is already answered.");
      }
      const answers = parseMappingAnswers(
        sheets.map(({ rows }) => sheetQuestions(rows).questions),
        input,
      );
      // As with Broccoli's model, a sheet without people columns is skipped; the file fails only
      // when every sheet does.
      const records: IncomingRecord[] = [];
      let mapped = false;
      sheets.forEach(({ name, rows }, index) => {
        const sheetAnswers = answers[index]!;
        const mapping = readColumnMapping(sheetAnswers);
        if (mapping !== null) {
          mapped = true;
          const sheetRecords = readFileRecords(rows, readHeaderRow(sheetAnswers), mapping);
          records.push(...inSheet(name, sheetRecords));
        }
      });
      const failure = mapped ? null : ("no_people_columns" as const);
      await imports.finishMapping(
        sourceId,
        source.mappingAttempt,
        failure ? { status: "failed", failure } : { status: "mapped" },
      );
      await imports.syncEmployeeRecords(sourceId, records);
      return {
        status: failure ? "failed" : "mapped",
        failure,
        people: records.length,
      };
    },
  };
}

/** A source mapped by answers and its sheets; NOT_FOUND for any other source. */
async function readAnsweredFile(
  tx: Tx,
  imports: ImportRepository,
  sourceId: string,
): Promise<{ source: FileSource; sheets: FileSheet[] }> {
  const source = await imports.findFileSource(sourceId);
  if (source?.readBy !== "answered_by_external_agent") {
    throw notWaiting();
  }
  const file = await readFile(tx, source.fileId);
  const sheets = file && (await readStaffFile(file.content));
  if (!sheets || typeof sheets === "string") {
    // The upload read the same bytes, so only a changed file gets here.
    throw new Error(`File source ${source.id} cannot be read`);
  }
  return { source, sheets };
}

function notWaiting(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "No file waits for your answers with this id.");
}
