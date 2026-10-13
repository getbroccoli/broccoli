import type { Actor } from "../../../../core/actor";
import type { Tx } from "../../../../core/db";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { SlackApi, SlackAuthorization } from "../../../../integrations/slack";
import { slackConnectionRepository } from "../../db";
import { beginSlackConnection, connectSlack } from "./connection";
import { getSlackConnection, isCurrentSlackConnection, readSlackMembers } from "./readConnection";

export type { SlackMembersRead } from "./readConnection";

/** Everything that can be done with the Slack connection; adapters and other modules call nothing else. */
export function createSlackUseCases({
  orm,
  eventBus,
  logger,
  encryption,
  slackAuthorization,
  slackApi,
}: Pick<ModuleDependencies, "orm" | "eventBus" | "logger" | "encryption"> & {
  slackAuthorization: SlackAuthorization;
  slackApi: SlackApi;
}) {
  const context = {
    orm,
    eventBus,
    logger,
    encryption,
    slackAuthorization,
    slackApi,
    connections: slackConnectionRepository(orm),
  };
  return {
    beginSlackConnection: (actor: Actor, returnTo: string) =>
      beginSlackConnection(context, actor, returnTo),
    connectSlack: (actor: Actor, params: { code: string; codeVerifier: string }) =>
      connectSlack(context, actor, params),
    getSlackConnection: (actor: Actor) => getSlackConnection(context, actor),
    readSlackMembers: () => readSlackMembers(context),
    isCurrentSlackConnection: (tx: Tx, snapshot: string) => isCurrentSlackConnection(tx, snapshot),
  };
}

export type SlackUseCases = ReturnType<typeof createSlackUseCases>;
