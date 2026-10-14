import type { SecurityContext } from "../../../../core/security";
import {
  type Connection,
  type PageArgs,
  parsePage,
  toConnection,
} from "../../../../core/pagination";
import { importEmployeeKeyset } from "../../db";
import type { ImportEmployee, ImportSource } from "../../domain";
import type { ImportContext } from "./importContext";

export interface ImportEmployeeListArgs extends PageArgs {
  /** Only this source's records; unset lists every source. */
  sourceId?: string;
}

/** The import's sources, oldest first. */
export function listSources(
  { imports }: ImportContext,
  ctx: SecurityContext,
): Promise<ImportSource[]> {
  ctx.requireOwnerOrSystem();
  return imports.listSources();
}

/** The sources with these ids, in any order; for loading many at once. */
export function readSources(
  { imports }: ImportContext,
  ctx: SecurityContext,
  ids: readonly string[],
): Promise<ImportSource[]> {
  ctx.requireOwnerOrSystem();
  return imports.findSources(ids);
}

/** The number of employee records of each of these sources. */
export async function countEmployees(
  { imports }: ImportContext,
  ctx: SecurityContext,
  sourceIds: readonly string[],
): Promise<Map<string, number>> {
  ctx.requireOwnerOrSystem();
  const counts = await imports.countEmployees(sourceIds);
  return new Map(sourceIds.map((id) => [id, counts.get(id) ?? 0]));
}

/** The import's employee records by name, one page at a time. */
export async function listEmployees(
  { imports }: ImportContext,
  ctx: SecurityContext,
  { sourceId, ...pageArgs }: ImportEmployeeListArgs,
): Promise<Connection<ImportEmployee>> {
  ctx.requireOwnerOrSystem();
  const page = parsePage(pageArgs, importEmployeeKeyset);
  return toConnection(
    await imports.findEmployeePage({ ...page, sourceId: sourceId ?? null }),
    page.first,
  );
}
