import type { Actor } from "../../../../core/actor";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { SlackApi, SlackAuthorization } from "../../../../integrations/slack";
import { importRepository } from "../../db";
import { beginSlackConnection } from "./beginSlackConnection";
import { connectSlack } from "./connectSlack";
import { refreshSlack } from "./refreshSlack";
import {
  canConnectSlack,
  countEmployees,
  type ImportEmployeeListArgs,
  listEmployees,
  listSources,
  readSources,
} from "./readImport";
import { skipImport } from "./skipImport";

/** Everything that can be done with the import; the adapters call nothing else. */
export function createImportUseCases({
  orm,
  eventBus,
  logger,
  encryption,
  slackAuthorization,
  slackApi,
}: Pick<ModuleDependencies, "orm" | "eventBus" | "logger" | "encryption"> & {
  slackAuthorization: SlackAuthorization | null;
  slackApi: SlackApi;
}) {
  const context = {
    orm,
    eventBus,
    logger,
    encryption,
    slackAuthorization,
    slackApi,
    imports: importRepository(orm),
  };
  return {
    beginSlackConnection: (actor: Actor, returnTo: string) =>
      beginSlackConnection(context, actor, returnTo),
    connectSlack: (actor: Actor, params: { code: string; codeVerifier: string }) =>
      connectSlack(context, actor, params),
    refreshSlack: (actor: Actor) => refreshSlack(context, actor),
    canConnectSlack: (actor: Actor) => canConnectSlack(context, actor),
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
