import type { SecurityContext } from "../../../../core/security";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import { importRepository } from "../../db";
import type { SlackReader } from "./importContext";

export type { SlackReader } from "./importContext";
import {
  countEmployees,
  type ImportEmployeeListArgs,
  listEmployees,
  listSources,
  readSources,
} from "./readImport";
import { readSlack } from "./readSlack";
import { skipImport } from "./skipImport";

/** Everything that can be done with the import; the adapters call nothing else. */
export function createImportUseCases({
  orm,
  eventBus,
  slack,
}: Pick<ModuleDependencies, "orm" | "eventBus"> & { slack: SlackReader }) {
  const context = { orm, eventBus, slack, imports: importRepository(orm) };
  return {
    readSlack: (ctx: SecurityContext) => readSlack(context, ctx),
    listSources: (ctx: SecurityContext) => listSources(context, ctx),
    readSources: (ctx: SecurityContext, ids: readonly string[]) => readSources(context, ctx, ids),
    countEmployees: (ctx: SecurityContext, sourceIds: readonly string[]) =>
      countEmployees(context, ctx, sourceIds),
    listEmployees: (ctx: SecurityContext, args: ImportEmployeeListArgs) =>
      listEmployees(context, ctx, args),
    skipImport: (ctx: SecurityContext) => skipImport(context, ctx),
  };
}

export type ImportUseCases = ReturnType<typeof createImportUseCases>;
