import type { Orm, Transact } from "../../db";
import type { Logger } from "../../logger";
import type { SecurityContext } from "../../security";
import { agentConnectionRepository, type StoredAgentConnection } from "../db";

/** A person's agent connections: allowing one, ending them, and reading the current one. */
export interface AgentConnectionService {
  /** Ends the person's connections of every client but the one they just allowed. */
  keepOnlyConnection: (
    ctx: SecurityContext,
    input: { userId: string; clientId: string },
  ) => Promise<void>;
  /** Ends every connection of the person, for `reason`. */
  endConnections: (
    ctx: SecurityContext,
    input: { userId: string; reason: AgentConnectionEnding },
  ) => Promise<void>;
  /** Adds the OAuth resource agents name for the MCP server at this address, once. */
  ensureAgentResource: (ctx: SecurityContext, resource: string) => Promise<void>;
  /**
   * Deletes browser sessions that have expired. A token belongs to the session it was allowed in,
   * so this detaches the tokens of expired ones and the connection outlives the browser's sign-in.
   */
  detachExpiredSessions: (ctx: SecurityContext) => Promise<void>;
  /** The caller's own connection; null without one, or for a caller who is no user. */
  readMyAgentConnection: (ctx: SecurityContext) => Promise<StoredAgentConnection | null>;
}

/** Why Broccoli ended a person's agent connections. */
export type AgentConnectionEnding = "PASSWORD_RESET";

export function createAgentConnectionService({
  orm,
  transact,
  logger,
}: {
  orm: Orm;
  transact: Transact;
  logger: Logger;
}): AgentConnectionService {
  return {
    async keepOnlyConnection(ctx, { userId, clientId }) {
      ctx.requireSystem();
      const { allowed, ended } = await transact(async (tx) => {
        const connections = agentConnectionRepository(tx);
        return {
          ended: await connections.deleteConnections(userId, clientId),
          allowed: await connections.findConnection(userId),
        };
      });
      logger.info(
        { userId, connectionId: allowed?.id, endedConnectionIds: ended },
        "Agent connection allowed",
      );
    },
    async endConnections(ctx, { userId, reason }) {
      ctx.requireSystem();
      const ended = await transact((tx) =>
        agentConnectionRepository(tx).deleteConnections(userId, null),
      );
      if (ended.length > 0) {
        logger.info({ userId, endedConnectionIds: ended, reason }, "Agent connections ended");
      }
    },
    async ensureAgentResource(ctx, resource) {
      ctx.requireSystem();
      await agentConnectionRepository(orm).ensureResource(resource);
    },
    async detachExpiredSessions(ctx) {
      ctx.requireSystem();
      await agentConnectionRepository(orm).deleteExpiredSessions(new Date());
    },
    async readMyAgentConnection(ctx) {
      return ctx.user ? agentConnectionRepository(orm).findConnection(ctx.user.userId) : null;
    },
  };
}
