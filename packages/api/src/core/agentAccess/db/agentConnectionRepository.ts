import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNotNull, lt, ne } from "drizzle-orm";

import {
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  oauthResource,
  session,
  user,
} from "../../auth";
import { type Orm, ormOf, type Tx } from "../../db";

/**
 * A person's agent connections, kept in the OAuth provider's tables: a consent per client, and
 * the tokens issued under it.
 */
export interface AgentConnectionRepository {
  /** The person's most recent connection, or null without one. */
  findConnection(userId: string): Promise<StoredAgentConnection | null>;
  /** The person's connection of this client and their email, or null when it has ended. */
  findConnectionOf(userId: string, clientId: string): Promise<ConnectionInUse | null>;
  /** Notes that the connection was used at `now`. */
  touchConnection(connectionId: string, now: Date): Promise<void>;
  /**
   * Deletes the person's consents and tokens of every client but `keptClientId` (every client
   * when null), and returns the ids of the consents it deleted.
   */
  deleteConnections(userId: string, keptClientId: string | null): Promise<string[]>;
  /** Adds the resource row for `identifier` unless it exists. */
  ensureResource(identifier: string): Promise<void>;
  /**
   * Deletes the browser sessions that expired before `now` and still hold agent tokens, detaching
   * the tokens issued in them.
   */
  deleteExpiredSessions(now: Date): Promise<void>;
}

export interface StoredAgentConnection {
  id: string;
  clientId: string;
  /** The name the client gave itself; null when it gave none. */
  clientName: string | null;
  connectedAt: Date;
}

export interface ConnectionInUse {
  id: string;
  email: string;
  lastUsedAt: Date;
}

export function agentConnectionRepository(db: Orm | Tx): AgentConnectionRepository {
  const orm = () => ormOf(db);
  return {
    async findConnection(userId) {
      const [row] = await orm()
        .select({
          id: oauthConsent.id,
          clientId: oauthConsent.clientId,
          clientName: oauthClient.name,
          connectedAt: oauthConsent.createdAt,
        })
        .from(oauthConsent)
        .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
        .where(eq(oauthConsent.userId, userId))
        .orderBy(desc(oauthConsent.createdAt))
        .limit(1);
      return row ?? null;
    },
    async findConnectionOf(userId, clientId) {
      const [row] = await orm()
        .select({ id: oauthConsent.id, email: user.email, lastUsedAt: oauthConsent.updatedAt })
        .from(oauthConsent)
        .innerJoin(user, eq(user.id, oauthConsent.userId))
        .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)));
      return row ?? null;
    },
    async touchConnection(connectionId, now) {
      await orm()
        .update(oauthConsent)
        .set({ updatedAt: now })
        .where(eq(oauthConsent.id, connectionId));
    },
    async deleteConnections(userId, keptClientId) {
      const ofPerson = (table: TokenOrConsentTable) =>
        keptClientId === null
          ? eq(table.userId, userId)
          : and(eq(table.userId, userId), ne(table.clientId, keptClientId));
      // Refresh tokens first: deleting one deletes the access tokens issued from it.
      await orm().delete(oauthRefreshToken).where(ofPerson(oauthRefreshToken));
      await orm().delete(oauthAccessToken).where(ofPerson(oauthAccessToken));
      const deleted = await orm()
        .delete(oauthConsent)
        .where(ofPerson(oauthConsent))
        .returning({ id: oauthConsent.id });
      return deleted.map(({ id }) => id);
    },
    async ensureResource(identifier) {
      const now = new Date();
      await orm()
        .insert(oauthResource)
        .values({
          id: randomUUID(),
          identifier,
          name: "Broccoli",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: oauthResource.identifier });
    },
    async deleteExpiredSessions(now) {
      const holdingTokens = orm()
        .select({ id: oauthRefreshToken.sessionId })
        .from(oauthRefreshToken)
        .where(isNotNull(oauthRefreshToken.sessionId));
      await orm()
        .delete(session)
        .where(and(lt(session.expiresAt, now), inArray(session.id, holdingTokens)));
    },
  };
}

type TokenOrConsentTable = typeof oauthAccessToken | typeof oauthRefreshToken | typeof oauthConsent;
