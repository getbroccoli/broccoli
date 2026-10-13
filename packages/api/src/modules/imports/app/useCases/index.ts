import type { Actor } from "../../../../core/actor";
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
    readSlack: (actor: Actor) => readSlack(context, actor),
    listSources: (actor: Actor) => listSources(context, actor),
    readSources: (actor: Actor, ids: readonly string[]) => readSources(context, actor, ids),
    countEmployees: (actor: Actor, sourceIds: readonly string[]) =>
      countEmployees(context, actor, sourceIds),
    listEmployees: (actor: Actor, args: ImportEmployeeListArgs) =>
      listEmployees(context, actor, args),
    skipImport: (actor: Actor) => skipImport(context, actor),
  };
}

export type ImportUseCases = ReturnType<typeof createImportUseCases>;
