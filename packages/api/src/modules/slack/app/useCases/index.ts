import type { SecurityContext } from "../../../../core/security";
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
    beginSlackConnection: (ctx: SecurityContext, returnTo: string) =>
      beginSlackConnection(context, ctx, returnTo),
    connectSlack: (ctx: SecurityContext, params: { code: string; codeVerifier: string }) =>
      connectSlack(context, ctx, params),
    getSlackConnection: (ctx: SecurityContext) => getSlackConnection(context, ctx),
    readSlackMembers: (ctx: SecurityContext) => readSlackMembers(context, ctx),
    isCurrentSlackConnection: (ctx: SecurityContext, tx: Tx, snapshot: string) =>
      isCurrentSlackConnection(ctx, tx, snapshot),
  };
}

export type SlackUseCases = ReturnType<typeof createSlackUseCases>;
