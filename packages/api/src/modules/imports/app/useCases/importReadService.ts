import { z } from "zod";

import type { Orm } from "../../../../core/db";
import {
  type Connection,
  type PageArgs,
  parsePage,
  toConnection,
} from "../../../../core/pagination";
import type { SecurityContext } from "../../../../core/security";
import { importPhotoRepository, importRepository } from "../../db";
import type { ImportEmployeeRecord, ImportSource } from "../../domain";
import { type ImportReview, readImportReview } from "./importReview";
import { requireImportAccess } from "./requireImportAccess";

/** Reading the import: its sources, their records and the review they make. Every function checks `ctx`. */
export interface ImportReadService {
  /** The import's sources, oldest first. */
  listSources(ctx: SecurityContext): Promise<ImportSource[]>;
  /** The sources with these ids, in any order; for loading many at once. */
  readSources(ctx: SecurityContext, ids: readonly string[]): Promise<ImportSource[]>;
  /** The number of employee records of each of these sources. */
  countEmployees(ctx: SecurityContext, sourceIds: readonly string[]): Promise<Map<string, number>>;
  /** The import as the setup review step shows it: its import employees, counts and checks. */
  readReview(ctx: SecurityContext): Promise<ImportReview>;
  /** One source's employee records, oldest first, one page at a time. */
  listEmployeeRecords(
    ctx: SecurityContext,
    args: PageArgs & { sourceId: string },
  ): Promise<Connection<ImportEmployeeRecord>>;
  /** Whether this file is an import record's photo, so the photo route may serve it. */
  isImportPhotoFile(ctx: SecurityContext, fileId: string): Promise<boolean>;
}

export function createImportReadService(orm: Orm): ImportReadService {
  const imports = importRepository(orm);
  const photos = importPhotoRepository(orm);
  return {
    listSources: (ctx: SecurityContext): Promise<ImportSource[]> => {
      requireImportAccess(ctx);
      return imports.listSources();
    },

    readSources: (ctx: SecurityContext, ids: readonly string[]): Promise<ImportSource[]> => {
      requireImportAccess(ctx);
      return imports.findSources(ids);
    },

    countEmployees: async (
      ctx: SecurityContext,
      sourceIds: readonly string[],
    ): Promise<Map<string, number>> => {
      requireImportAccess(ctx);
      const counts = await imports.countEmployees(sourceIds);
      return new Map(sourceIds.map((id) => [id, counts.get(id) ?? 0]));
    },

    readReview: (ctx: SecurityContext): Promise<ImportReview> => {
      requireImportAccess(ctx);
      return readImportReview(ctx, orm);
    },

    listEmployeeRecords: async (
      ctx: SecurityContext,
      { sourceId, ...pageArgs }: PageArgs & { sourceId: string },
    ): Promise<Connection<ImportEmployeeRecord>> => {
      requireImportAccess(ctx);
      const page = parsePage(pageArgs, RECORD_KEYSET);
      return toConnection(await imports.findRecordPage({ sourceId, ...page }), page.first);
    },

    isImportPhotoFile: async (ctx: SecurityContext, fileId: string): Promise<boolean> => {
      requireImportAccess(ctx);
      // Postgres refuses a malformed uuid, so only a parsed one reaches the query.
      const id = z.uuid().safeParse(fileId);
      return id.success && (await photos.hasPhoto(id.data));
    },
  };
}

const RECORD_KEYSET = z.tuple([z.uuid()]);
