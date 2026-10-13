import { type Actor, requireOwner } from "../../../../core/actor";
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
export function listSources({ imports }: ImportContext, actor: Actor): Promise<ImportSource[]> {
  requireOwner(actor);
  return imports.listSources();
}

/** The sources with these ids, in any order; for loading many at once. */
export function readSources(
  { imports }: ImportContext,
  actor: Actor,
  ids: readonly string[],
): Promise<ImportSource[]> {
  requireOwner(actor);
  return imports.findSources(ids);
}

/** The number of employee records of each of these sources. */
export async function countEmployees(
  { imports }: ImportContext,
  actor: Actor,
  sourceIds: readonly string[],
): Promise<Map<string, number>> {
  requireOwner(actor);
  const counts = await imports.countEmployees(sourceIds);
  return new Map(sourceIds.map((id) => [id, counts.get(id) ?? 0]));
}

/** The import's employee records by name, one page at a time. */
export async function listEmployees(
  { imports }: ImportContext,
  actor: Actor,
  { sourceId, ...pageArgs }: ImportEmployeeListArgs,
): Promise<Connection<ImportEmployee>> {
  requireOwner(actor);
  const page = parsePage(pageArgs, importEmployeeKeyset);
  return toConnection(
    await imports.findEmployeePage({ ...page, sourceId: sourceId ?? null }),
    page.first,
  );
}
