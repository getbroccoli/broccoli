import type { Actor } from "../../../../core/actor";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { SlackClient } from "../../../../integrations/slack";
import { importRepository } from "../../db";
import { beginSlackConnection } from "./beginSlackConnection";
import { connectSlack } from "./connectSlack";
import { refreshSlack } from "./refreshSlack";
import {
  countEmployees,
  type ImportEmployeeListArgs,
  listEmployees,
  listSources,
  readSources,
} from "./readImport";
import { skipImport } from "./skipImport";

export type { SlackConnectionStart } from "./beginSlackConnection";

/** Everything that can be done with the import; the adapters call nothing else. */
export function createImportUseCases({
  orm,
  eventBus,
  logger,
  secretBox,
  slack,
}: Pick<ModuleDependencies, "orm" | "eventBus" | "logger" | "secretBox"> & { slack: SlackClient }) {
  const context = { orm, eventBus, logger, secretBox, slack, imports: importRepository(orm) };
  return {
    beginSlackConnection: (actor: Actor, returnTo: string) =>
      beginSlackConnection(context, actor, returnTo),
    connectSlack: (actor: Actor, params: { handle: string; codeVerifier: string }) =>
      connectSlack(context, actor, params),
    refreshSlack: (actor: Actor) => refreshSlack(context, actor),
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
