import {
  type Connection,
  type OrderArg,
  type PageArgs,
  parseOrder,
  parsePage,
  toConnection,
} from "../../../../core/pagination";
import { parseSearch } from "../../../../core/search";
import type { SecurityContext } from "../../../../core/security";
import { importEmployeeKeyset, type ImportRepository } from "../../db";
import type { EmployeeOrder, EmployeeOrderField } from "../../../employees";
import type { ImportEmployeeRecord, ImportSource } from "../../domain";
import { toNewEmployee } from "./importEmployeeMapping";

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
  ): Promise<Connection<ImportEmployeeRecord>>;
}

export interface ImportEmployeeListArgs extends PageArgs {
  /** Only this source's records; unset lists every source. */
  sourceId?: string;
  /** Defaults to name order; the direction to ascending. */
  orderBy?: OrderArg<EmployeeOrderField>;
  filter?: { search?: string | null } | null;
}

const DEFAULT_ORDER: EmployeeOrder = { field: "NAME", direction: "ASC" };

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
      return records.filter((record) => toNewEmployee(record) !== null).length;
    },

    listEmployees: async (
      ctx: SecurityContext,
      { sourceId, orderBy, filter, ...pageArgs }: ImportEmployeeListArgs,
    ): Promise<Connection<ImportEmployeeRecord>> => {
      ctx.requireOwnerOrSystem();
      const order = parseOrder(orderBy, DEFAULT_ORDER);
      const search = parseSearch(filter?.search);
      const page = parsePage(pageArgs, importEmployeeKeyset(order));
      return toConnection(
        await imports.findEmployeePage({ ...page, order, search, sourceId: sourceId ?? null }),
        page.first,
      );
    },
  };
}
