import { ApplicationError } from "../../applicationError";
import type { Orm, Transact } from "../../db";
import type { Logger } from "../../logger";
import type { SecurityContext } from "../../security";
import {
  agentConnectionRepository,
  type StoredAgentConnection,
  type StoredEndedAgentConnection,
} from "../db";
import type { AgentConnectionEnding } from "../domain";

/** A connection unused this long ends. */
const UNUSED_CONNECTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A person's agent connections: allowing one, ending them, and reading the current one. */
export interface AgentConnectionService {
  /** Ends the person's connections of every client but the one they just allowed. */
  keepOnlyConnection: (
    ctx: SecurityContext,
    input: { userId: string; clientId: string },
  ) => Promise<void>;
  /**
   * The person an agent's call acts for, through their connection of this client, noting the use;
   * null when the connection has ended, or ending it now when it went unused for 30 days.
   */
  useAgentConnection: (
    ctx: SecurityContext,
    input: { userId: string; clientId: string },
  ) => Promise<{ id: string; email: string } | null>;
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
  /** Ends the caller's own connection, so its next call is refused; null when none was connected. */
  disconnectMyAgent: (ctx: SecurityContext) => Promise<StoredEndedAgentConnection | null>;
  /** The caller's most recently ended connection; null without one, or for a caller who is no user. */
  readMyLastEndedConnection: (ctx: SecurityContext) => Promise<StoredEndedAgentConnection | null>;
  /** Whether the caller closed the invitation to connect their agent; false for a caller who is no user. */
  isInvitationClosed: (ctx: SecurityContext) => Promise<boolean>;
  /** Closes the invitation to connect their agent for the caller, for good. */
  closeInvitation: (ctx: SecurityContext) => Promise<void>;
}

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
        await connections.lockPerson(userId);
        // Another Allow at the same moment may have replaced this one already; that one stays.
        if (!(await connections.findConnectionOf(userId, clientId))) {
          return { ended: [], allowed: null };
        }
        return {
          ended: await connections.endConnections(userId, clientId, {
            reason: "replaced_by_another_agent",
            endedAt: new Date(),
          }),
          allowed: await connections.findConnection(userId),
        };
      });
      if (allowed) {
        logger.info(
          { userId, connectionId: allowed.id, endedConnectionIds: ended.map(({ id }) => id) },
          "Agent connection allowed",
        );
      }
    },
    async useAgentConnection(ctx, { userId, clientId }) {
      ctx.requireSystem();
      const connections = agentConnectionRepository(orm);
      const connection = await connections.findConnectionOf(userId, clientId);
      if (!connection) {
        return null;
      }
      const now = new Date();
      if (now.getTime() - connection.lastUsedAt.getTime() > UNUSED_CONNECTION_DAYS * DAY_MS) {
        await endUnusedConnection({ transact, logger }, { userId, clientId });
        return null;
      }
      await connections.touchConnection(connection.id, now);
      return { id: userId, email: connection.email };
    },
    async endConnections(ctx, { userId, reason }) {
      ctx.requireSystem();
      await endAllConnections({ transact, logger }, { userId, reason });
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
    async disconnectMyAgent(ctx) {
      if (!ctx.user) {
        throw new ApplicationError(
          "FORBIDDEN",
          "Only a signed-in person can disconnect their agent.",
        );
      }
      const { userId } = ctx.user;
      const ended = await endAllConnections(
        { transact, logger },
        { userId, reason: "disconnected_by_person" },
      );
      // The same pick as the page's next read, when several connections ended at once.
      return ended.length > 0 ? agentConnectionRepository(orm).findLastEnding(userId) : null;
    },
    async readMyLastEndedConnection(ctx) {
      return ctx.user ? agentConnectionRepository(orm).findLastEnding(ctx.user.userId) : null;
    },
    async isInvitationClosed(ctx) {
      return ctx.user ? agentConnectionRepository(orm).isInvitationClosed(ctx.user.userId) : false;
    },
    async closeInvitation(ctx) {
      if (!ctx.user) {
        throw new ApplicationError(
          "FORBIDDEN",
          "Only a signed-in person can close the invitation to connect their agent.",
        );
      }
      const { userId } = ctx.user;
      await agentConnectionRepository(orm).closeInvitation(userId, new Date());
      logger.info({ userId }, "Agent invitation closed");
    },
  };
}

/** Ends every connection of the person, for `reason`, and returns them. */
async function endAllConnections(
  { transact, logger }: { transact: Transact; logger: Logger },
  { userId, reason }: { userId: string; reason: AgentConnectionEnding },
): Promise<StoredEndedAgentConnection[]> {
  const ended = await transact(async (tx) => {
    const connections = agentConnectionRepository(tx);
    await connections.lockPerson(userId);
    return connections.endConnections(userId, null, { reason, endedAt: new Date() });
  });
  if (ended.length > 0) {
    logger.info(
      { userId, endedConnectionIds: ended.map(({ id }) => id), reason },
      "Agent connections ended",
    );
  }
  return ended;
}

/** Ends the unused connection of this client only, so a replacement allowed meanwhile stays. */
async function endUnusedConnection(
  { transact, logger }: { transact: Transact; logger: Logger },
  { userId, clientId }: { userId: string; clientId: string },
): Promise<void> {
  const ended = await transact(async (tx) => {
    const connections = agentConnectionRepository(tx);
    await connections.lockPerson(userId);
    return connections.endConnection(userId, clientId, {
      reason: "ended_after_30_days_unused",
      endedAt: new Date(),
    });
  });
  if (ended) {
    logger.info(
      { userId, endedConnectionIds: [ended.id], reason: ended.reason },
      "Agent connections ended",
    );
  }
}
