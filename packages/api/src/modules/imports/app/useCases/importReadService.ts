import {
  type Connection,
  type PageArgs,
  parsePage,
  toConnection,
} from "../../../../core/pagination";
import type { SecurityContext } from "../../../../core/security";
import { importEmployeeKeyset, type ImportRepository } from "../../db";
import type { ImportEmployee, ImportSource } from "../../domain";

/** Reading the import: its sources and their employee records. Every function checks `ctx`. */
export interface ImportReadService {
  /** The import's sources, oldest first. */
  listSources(ctx: SecurityContext): Promise<ImportSource[]>;
  /** The sources with these ids, in any order; for loading many at once. */
  readSources(ctx: SecurityContext, ids: readonly string[]): Promise<ImportSource[]>;
  /** The number of employee records of each of these sources. */
  countEmployees(ctx: SecurityContext, sourceIds: readonly string[]): Promise<Map<string, number>>;
  /** The import's employee records by name, one page at a time. */
  listEmployees(
    ctx: SecurityContext,
    args: ImportEmployeeListArgs,
  ): Promise<Connection<ImportEmployee>>;
}

export interface ImportEmployeeListArgs extends PageArgs {
  /** Only this source's records; unset lists every source. */
  sourceId?: string;
}

export function createImportReadService(imports: ImportRepository): ImportReadService {
  return {
    listSources: (ctx: SecurityContext): Promise<ImportSource[]> => {
      ctx.requireOwnerOrSystem();
      return imports.listSources();
    },

    readSources: (ctx: SecurityContext, ids: readonly string[]): Promise<ImportSource[]> => {
      ctx.requireOwnerOrSystem();
      return imports.findSources(ids);
    },

    countEmployees: async (
      ctx: SecurityContext,
      sourceIds: readonly string[],
    ): Promise<Map<string, number>> => {
      ctx.requireOwnerOrSystem();
      const counts = await imports.countEmployees(sourceIds);
      return new Map(sourceIds.map((id) => [id, counts.get(id) ?? 0]));
    },

    listEmployees: async (
      ctx: SecurityContext,
      { sourceId, ...pageArgs }: ImportEmployeeListArgs,
    ): Promise<Connection<ImportEmployee>> => {
      ctx.requireOwnerOrSystem();
      const page = parsePage(pageArgs, importEmployeeKeyset);
      return toConnection(
        await imports.findEmployeePage({ ...page, sourceId: sourceId ?? null }),
        page.first,
      );
    },
  };
}
