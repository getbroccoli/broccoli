import { z } from "zod";

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
import type { ImportPhotoRepository, ImportRepository } from "../../db";
import type { EmployeeOrder, EmployeeOrderField } from "../../../employees";
import {
  type ImportCheck,
  type ImportEmployee,
  type ImportEmployeeRecord,
  type ImportSource,
  isInCheck,
  listChecks,
  parseCheckId,
  toNewEmployee,
} from "../../domain";
import { importEmployeeKeyset, matchesSearch, pageImportEmployees } from "./importEmployeeList";
import { readImportEmployees } from "./readImportEmployees";
import { requireImportAccess } from "./requireImportAccess";

/** Reading the import: its sources, their records and the employees they make. Every function checks `ctx`. */
export interface ImportReadService {
  /** The import's sources, oldest first. */
  listSources(ctx: SecurityContext): Promise<ImportSource[]>;
  /** The sources with these ids, in any order; for loading many at once. */
  readSources(ctx: SecurityContext, ids: readonly string[]): Promise<ImportSource[]>;
  /** The number of employee records of each of these sources. */
  countEmployees(ctx: SecurityContext, sourceIds: readonly string[]): Promise<Map<string, number>>;
  /** How many import employees there are, left out or not. */
  employeeCount(ctx: SecurityContext): Promise<number>;
  /** How many employees Approve would add: the import employees that are ready and not left out. */
  readyEmployeeCount(ctx: SecurityContext): Promise<number>;
  /** The sources of the employees Approve would add, oldest first. */
  listReadyEmployeeSources(ctx: SecurityContext): Promise<ImportSource[]>;
  /** The import employees, one page at a time; by name unless ordered otherwise. */
  listEmployees(
    ctx: SecurityContext,
    args: ImportEmployeeListArgs,
  ): Promise<Connection<ImportEmployee>>;
  /** One source's employee records, oldest first, one page at a time. */
  listEmployeeRecords(
    ctx: SecurityContext,
    args: PageArgs & { sourceId: string },
  ): Promise<Connection<ImportEmployeeRecord>>;
  /** What the owner may want to settle before Approve, by kind. */
  listChecks(ctx: SecurityContext): Promise<ImportCheck[]>;
  /** Whether this file is an import record's photo, so the photo route may serve it. */
  isImportPhotoFile(ctx: SecurityContext, fileId: string): Promise<boolean>;
}

export interface ImportEmployeeListArgs extends PageArgs {
  /** Defaults to name order; the direction to ascending. */
  orderBy?: OrderArg<EmployeeOrderField>;
  /** `check` is a check's id: only its import employees. */
  filter?: { search?: string | null; check?: string | null } | null;
}

const DEFAULT_ORDER: EmployeeOrder = { field: "NAME", direction: "ASC" };

export function createImportReadService(
  imports: ImportRepository,
  photos: ImportPhotoRepository,
): ImportReadService {
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

    employeeCount: async (ctx: SecurityContext): Promise<number> => {
      requireImportAccess(ctx);
      return (await readImportEmployees(imports)).length;
    },

    readyEmployeeCount: async (ctx: SecurityContext): Promise<number> => {
      requireImportAccess(ctx);
      return (await readReadyEmployees(imports)).length;
    },

    listReadyEmployeeSources: async (ctx: SecurityContext): Promise<ImportSource[]> => {
      requireImportAccess(ctx);
      const ready = await readReadyEmployees(imports);
      const sourceIds = new Set(
        ready.flatMap(({ records }) => records.map((record) => record.sourceId)),
      );
      return (await imports.listSources()).filter(({ id }) => sourceIds.has(id));
    },

    listEmployees: async (
      ctx: SecurityContext,
      { orderBy, filter, ...pageArgs }: ImportEmployeeListArgs,
    ): Promise<Connection<ImportEmployee>> => {
      requireImportAccess(ctx);
      const order = parseOrder(orderBy, DEFAULT_ORDER);
      const search = parseSearch(filter?.search);
      const check = filter?.check ? parseCheckId(filter.check) : null;
      const page = parsePage(pageArgs, importEmployeeKeyset(order));
      // shortcut: the whole import is grouped per request; move grouping to SQL or cache it when imports outgrow setup sizes.
      const employees = (await readImportEmployees(imports)).filter(
        (employee) =>
          (search === null || matchesSearch(employee, search)) &&
          (check === null || isInCheck(employee, check)),
      );
      return toConnection(pageImportEmployees(employees, order, page), page.first);
    },

    listEmployeeRecords: async (
      ctx: SecurityContext,
      { sourceId, ...pageArgs }: PageArgs & { sourceId: string },
    ): Promise<Connection<ImportEmployeeRecord>> => {
      requireImportAccess(ctx);
      const page = parsePage(pageArgs, RECORD_KEYSET);
      return toConnection(await imports.findRecordPage({ sourceId, ...page }), page.first);
    },

    listChecks: async (ctx: SecurityContext): Promise<ImportCheck[]> => {
      requireImportAccess(ctx);
      const [sources, employees] = await Promise.all([
        imports.listSources(),
        readImportEmployees(imports),
      ]);
      return listChecks(sources, employees);
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

/** The import employees Approve would add: ready and not left out. */
async function readReadyEmployees(imports: ImportRepository): Promise<ImportEmployee[]> {
  const employees = await readImportEmployees(imports);
  return employees.filter((employee) => !employee.leftOut && toNewEmployee(employee) !== null);
}
