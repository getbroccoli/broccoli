import {
  type Connection,
  type PageArgs,
  parsePage,
  parseSearch,
  toConnection,
} from "../../../../core/pagination";
import type { SecurityContext } from "../../../../core/security";
import { importEmployeeKeyset, type ImportEmployeeOrder, type ImportRepository } from "../../db";
import type { ImportEmployee, ImportSource } from "../../domain";
import { readyEmployee } from "./readyEmployee";

/** Reading the import: its sources and their employee records. Every function checks `ctx`. */
export interface ImportReadService {
  /** The import's sources, oldest first. */
  listSources(ctx: SecurityContext): Promise<ImportSource[]>;
  /** The sources with these ids, in any order; for loading many at once. */
  readSources(ctx: SecurityContext, ids: readonly string[]): Promise<ImportSource[]>;
  /** The number of employee records of each of these sources. */
  countEmployees(ctx: SecurityContext, sourceIds: readonly string[]): Promise<Map<string, number>>;
  /** How many employee records Approve would add: the ready ones. */
  readyEmployeeCount(ctx: SecurityContext): Promise<number>;
  /** The import's employee records, one page at a time; by name unless ordered otherwise. */
  listEmployees(
    ctx: SecurityContext,
    args: ImportEmployeeListArgs,
  ): Promise<Connection<ImportEmployee>>;
}

export interface ImportEmployeeListArgs extends PageArgs {
  /** Only this source's records; unset lists every source. */
  sourceId?: string;
  /** Defaults to name order; the direction to ascending. */
  orderBy?: {
    field: ImportEmployeeOrder["field"];
    direction?: ImportEmployeeOrder["direction"] | null;
  } | null;
  filter?: { search?: string | null } | null;
}

const DEFAULT_ORDER: ImportEmployeeOrder = { field: "NAME", direction: "ASC" };

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

    readyEmployeeCount: async (ctx: SecurityContext): Promise<number> => {
      ctx.requireOwnerOrSystem();
      const records = await imports.listEmployeeRecords();
      return records.filter((record) => readyEmployee(record) !== null).length;
    },

    listEmployees: async (
      ctx: SecurityContext,
      { sourceId, orderBy, filter, ...pageArgs }: ImportEmployeeListArgs,
    ): Promise<Connection<ImportEmployee>> => {
      ctx.requireOwnerOrSystem();
      const order: ImportEmployeeOrder = orderBy
        ? { field: orderBy.field, direction: orderBy.direction ?? "ASC" }
        : DEFAULT_ORDER;
      const search = parseSearch(filter?.search);
      const page = parsePage(pageArgs, importEmployeeKeyset(order));
      return toConnection(
        await imports.findEmployeePage({ ...page, order, search, sourceId: sourceId ?? null }),
        page.first,
      );
    },
  };
}
