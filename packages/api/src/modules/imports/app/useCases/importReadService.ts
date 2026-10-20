import { z } from "zod";

import type { Orm } from "../../../../core/db";
import {
  type Connection,
  type ListOrder,
  type PageArgs,
  paginate,
} from "../../../../core/pagination";
import type { SecurityContext } from "../../../../core/security";
import { importReader } from "../../db";
import {
  type ImportEmployeeRecord,
  type ImportProgress,
  importProgress,
  type ImportSource,
} from "../../domain";
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
  /** Whether a file is still being read, and whether the demo company may still replace the import. */
  readProgress(ctx: SecurityContext): Promise<ImportProgress>;
  /** The import as the setup review step shows it: its import employees, counts and checks. */
  readReview(ctx: SecurityContext): Promise<ImportReview>;
  /** One source's employee records, oldest first, one page at a time. */
  listEmployeeRecords(
    ctx: SecurityContext,
    args: PageArgs & { sourceId: string },
  ): Promise<Connection<ImportEmployeeRecord>>;
}

export function createImportReadService(orm: Orm): ImportReadService {
  const imports = importReader(orm);
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

    readProgress: async (ctx: SecurityContext): Promise<ImportProgress> => {
      requireImportAccess(ctx);
      const sources = await imports.listSources();
      const counts = await imports.countEmployees(sources.map(({ id }) => id));
      return importProgress(
        sources,
        [...counts.values()].reduce((sum, count) => sum + count, 0),
      );
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
      return paginate(pageArgs, {
        order: RECORD_ORDER,
        keysetValues: { ADDED: z.tuple([z.uuid()]) },
        fetch: ({ after, limit }) => imports.findRecordPage({ sourceId, after, limit }),
      });
    },
  };
}

/** Records list in the order they were added, their only order. */
const RECORD_ORDER: ListOrder<"ADDED"> = { field: "ADDED", direction: "ASC" };
