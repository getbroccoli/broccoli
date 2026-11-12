import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNotNull, lt, ne, type SQL } from "drizzle-orm";

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
import type { AgentConnectionEnding } from "../domain";
import { agentConnectionEndings } from "./agentConnectionEndingsTable";

/**
 * A person's agent connections, kept in the OAuth provider's tables: a consent per client, and
 * the tokens issued under it.
 */
export interface AgentConnectionRepository {
  /** The person's most recent connection, or null without one. */
  findConnection(userId: string): Promise<StoredAgentConnection | null>;
  /** The person's connection of this client and their email, or null when it has ended. */
  findConnectionOf(userId: string, clientId: string): Promise<ConnectionInUse | null>;
  /** Locks the person's user row until the transaction ends, so their connections change in turn. */
  lockPerson(userId: string): Promise<void>;
  /** Notes that the connection was used at `now`. */
  touchConnection(connectionId: string, now: Date): Promise<void>;
  /**
   * Ends the person's connections of every client but `keptClientId` (every client when null):
   * deletes their consents and tokens and stores each ending.
   */
  endConnections(
    userId: string,
    keptClientId: string | null,
    ending: Ending,
  ): Promise<StoredEndedAgentConnection[]>;
  /** Ends the person's connection of this client, as `endConnections` does; null without one. */
  endConnection(
    userId: string,
    clientId: string,
    ending: Ending,
  ): Promise<StoredEndedAgentConnection | null>;
  /** The person's most recently ended connection, or null when none has ended. */
  findLastEnding(userId: string): Promise<StoredEndedAgentConnection | null>;
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
  lastUsedAt: Date;
}

export interface Ending {
  reason: AgentConnectionEnding;
  endedAt: Date;
}

export interface StoredEndedAgentConnection extends Ending {
  /** The ended connection's consent id. */
  id: string;
  clientId: string;
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
          lastUsedAt: oauthConsent.updatedAt,
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
    async lockPerson(userId) {
      await orm().select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
    },
    async touchConnection(connectionId, now) {
      await orm()
        .update(oauthConsent)
        .set({ updatedAt: now })
        .where(eq(oauthConsent.id, connectionId));
    },
    async endConnections(userId, keptClientId, ending) {
      const ofPerson = (table: TokenOrConsentTable) =>
        keptClientId === null
          ? eq(table.userId, userId)
          : and(eq(table.userId, userId), ne(table.clientId, keptClientId));
      return endMatching(db, ofPerson, { userId, ...ending });
    },
    async endConnection(userId, clientId, ending) {
      const ofClient = (table: TokenOrConsentTable) =>
        and(eq(table.userId, userId), eq(table.clientId, clientId));
      const [ended] = await endMatching(db, ofClient, { userId, ...ending });
      return ended ?? null;
    },
    async findLastEnding(userId) {
      const [row] = await selectEndings(orm())
        .where(eq(agentConnectionEndings.userId, userId))
        // Connections ended together share `endedAt`; the newest of them ended last, as Disconnect says.
        .orderBy(desc(agentConnectionEndings.endedAt), desc(agentConnectionEndings.connectedAt))
        .limit(1);
      return row ?? null;
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

/** Deletes the matching consents and their tokens, and stores an ending for each consent. */
async function endMatching(
  db: Orm | Tx,
  matching: (table: TokenOrConsentTable) => SQL | undefined,
  ending: Ending & { userId: string },
): Promise<StoredEndedAgentConnection[]> {
  const orm = ormOf(db);
  // Refresh tokens first: deleting one deletes the access tokens issued from it.
  await orm.delete(oauthRefreshToken).where(matching(oauthRefreshToken));
  await orm.delete(oauthAccessToken).where(matching(oauthAccessToken));
  const deleted = await orm.delete(oauthConsent).where(matching(oauthConsent)).returning({
    id: oauthConsent.id,
    clientId: oauthConsent.clientId,
    connectedAt: oauthConsent.createdAt,
  });
  if (deleted.length === 0) {
    return [];
  }
  await orm.insert(agentConnectionEndings).values(deleted.map((row) => ({ ...row, ...ending })));
  return selectEndings(orm).where(
    inArray(
      agentConnectionEndings.id,
      deleted.map(({ id }) => id),
    ),
  );
}

function selectEndings(orm: ReturnType<typeof ormOf>) {
  return orm
    .select({
      id: agentConnectionEndings.id,
      clientId: agentConnectionEndings.clientId,
      clientName: oauthClient.name,
      connectedAt: agentConnectionEndings.connectedAt,
      endedAt: agentConnectionEndings.endedAt,
      reason: agentConnectionEndings.reason,
    })
    .from(agentConnectionEndings)
    .leftJoin(oauthClient, eq(oauthClient.clientId, agentConnectionEndings.clientId))
    .$dynamic();
}
