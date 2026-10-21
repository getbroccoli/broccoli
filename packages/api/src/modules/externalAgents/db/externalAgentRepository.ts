import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import { hashExternalAgentSecret } from "../helpers";
import { externalAgentCodes } from "./externalAgentCodesTable";
import { externalAgentSessions } from "./externalAgentSessionsTable";

/**
 * The external agent's one-time codes and sessions, through the pool or inside a transaction.
 * Codes and tokens go in as themselves and are stored only as hashes. One agent at a time.
 */
export interface ExternalAgentRepository {
  /** Ends every session and cancels every unused code. */
  endAll(now: Date): Promise<void>;
  /** Ends everything, as `endAll`, then stores a new code. */
  replaceCode(code: { secret: string; expiresAt: Date }, now: Date): Promise<void>;
  /**
   * Uses up the live code `code` and starts a session for it; false, storing nothing, for a code
   * that is unknown, used, cancelled or expired. Of two concurrent calls with one code, one wins.
   */
  exchangeCode(
    code: string,
    session: { token: string; client: string; expiresAt: Date },
    now: Date,
  ): Promise<boolean>;
  /** The id of the live session with this token, or null. */
  findLiveSession(token: string, now: Date): Promise<string | null>;
  /** Locks the live session with this id until the transaction ends; false when it is not live. */
  lockLiveSession(id: string, now: Date): Promise<boolean>;
  /** The newest live session, as the setup holder sees it. */
  findConnection(now: Date): Promise<ExternalAgentConnection | null>;
}

/** The connected external agent, as the setup holder sees it. */
export interface ExternalAgentConnection {
  /** The name the agent gave itself; not proof of what it is. */
  client: string;
  connectedAt: Date;
  expiresAt: Date;
}

export function externalAgentRepository(db: Orm | Tx): ExternalAgentRepository {
  const orm = () => ormOf(db);
  const endAll = async (now: Date) => {
    await orm()
      .update(externalAgentCodes)
      .set({ cancelledAt: now })
      .where(and(isNull(externalAgentCodes.usedAt), isNull(externalAgentCodes.cancelledAt)));
    await orm()
      .update(externalAgentSessions)
      .set({ endedAt: now })
      .where(isNull(externalAgentSessions.endedAt));
  };

  return {
    endAll,

    replaceCode: async ({ secret, expiresAt }, now) => {
      await endAll(now);
      await orm()
        .insert(externalAgentCodes)
        .values({ secretHash: hashExternalAgentSecret(secret), expiresAt });
    },

    exchangeCode: async (code, { token, client, expiresAt }, now) => {
      const [used] = await orm()
        .update(externalAgentCodes)
        .set({ usedAt: now })
        .where(
          and(
            eq(externalAgentCodes.secretHash, hashExternalAgentSecret(code)),
            isNull(externalAgentCodes.usedAt),
            isNull(externalAgentCodes.cancelledAt),
            gt(externalAgentCodes.expiresAt, now),
          ),
        )
        .returning({ id: externalAgentCodes.id });
      if (!used) {
        return false;
      }
      await orm()
        .insert(externalAgentSessions)
        .values({ tokenHash: hashExternalAgentSecret(token), client, expiresAt });
      return true;
    },

    findLiveSession: async (token, now) => {
      const [row] = await orm()
        .select({ id: externalAgentSessions.id })
        .from(externalAgentSessions)
        .where(
          and(eq(externalAgentSessions.tokenHash, hashExternalAgentSecret(token)), isLive(now)),
        );
      return row?.id ?? null;
    },

    lockLiveSession: async (id, now) => {
      const [row] = await orm()
        .select({ id: externalAgentSessions.id })
        .from(externalAgentSessions)
        .where(and(eq(externalAgentSessions.id, id), isLive(now)))
        .for("update");
      return row !== undefined;
    },

    findConnection: async (now) => {
      const [row] = await orm()
        .select({
          client: externalAgentSessions.client,
          connectedAt: externalAgentSessions.createdAt,
          expiresAt: externalAgentSessions.expiresAt,
        })
        .from(externalAgentSessions)
        .where(isLive(now))
        .orderBy(desc(externalAgentSessions.createdAt))
        .limit(1);
      return row ?? null;
    },
  };
}

/** The sessions that have not ended and not expired at `now`. */
function isLive(now: Date) {
  return and(isNull(externalAgentSessions.endedAt), gt(externalAgentSessions.expiresAt, now));
}
