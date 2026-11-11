import { randomUUID } from "node:crypto";

import { and, desc, eq, lt, ne } from "drizzle-orm";

import {
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  oauthResource,
  session,
} from "../../auth";
import { type Orm, ormOf, type Tx } from "../../db";

/**
 * A person's agent connections, kept in the OAuth provider's tables: a consent per client, and
 * the tokens issued under it.
 */
export interface AgentConnectionRepository {
  /** The person's most recent connection, or null without one. */
  findConnection(userId: string): Promise<StoredAgentConnection | null>;
  /**
   * Deletes the person's consents and tokens of every client but `keptClientId` (every client
   * when null), and returns the ids of the consents it deleted.
   */
  deleteConnections(userId: string, keptClientId: string | null): Promise<string[]>;
  /** Adds the resource row for `identifier` unless it exists. */
  ensureResource(identifier: string): Promise<void>;
  /** Deletes browser sessions that expired before `now`, detaching the tokens issued in them. */
  deleteExpiredSessions(now: Date): Promise<void>;
}

export interface StoredAgentConnection {
  id: string;
  clientId: string;
  /** The name the client gave itself; null when it gave none. */
  clientName: string | null;
  connectedAt: Date;
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
          connectedAt: oauthConsent.updatedAt,
        })
        .from(oauthConsent)
        .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
        .where(eq(oauthConsent.userId, userId))
        .orderBy(desc(oauthConsent.updatedAt))
        .limit(1);
      return row ?? null;
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
      await orm().delete(session).where(lt(session.expiresAt, now));
    },
  };
}

type TokenOrConsentTable = typeof oauthAccessToken | typeof oauthRefreshToken | typeof oauthConsent;
