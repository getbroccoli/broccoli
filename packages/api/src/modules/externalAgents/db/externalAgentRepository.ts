import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { ExternalAgentConnection } from "../domain";
import { externalAgentCodes } from "./externalAgentCodesTable";
import { externalAgentSessions } from "./externalAgentSessionsTable";

/** Agent one-time codes and agent sessions, through the pool or inside a transaction. */
export interface ExternalAgentRepository {
  insertCode(code: { secretHash: string; expiresAt: Date }): Promise<void>;
  /**
   * Marks the live code with this hash used at `now`; false for a code that is unknown, used,
   * cancelled or expired. Of two concurrent calls with one code, one gets true.
   */
  useCode(secretHash: string, now: Date): Promise<boolean>;
  /** Cancels every code not yet used, so none can be exchanged any more. */
  cancelUnusedCodes(now: Date): Promise<void>;
  insertSession(session: { tokenHash: string; client: string; expiresAt: Date }): Promise<void>;
  /** The session with this token hash, while it is neither ended nor expired. */
  findLiveSession(tokenHash: string, now: Date): Promise<LiveExternalAgentSession | null>;
  /** The session with this id, locked until the transaction ends, while it is live. */
  lockLiveSession(id: string, now: Date): Promise<LiveExternalAgentSession | null>;
  /** Ends every session that has not ended, whether it is live, idle or expired. */
  endSessions(now: Date): Promise<void>;
  /** Records a call of a session that has not ended, at most once a minute. */
  recordCall(id: string, now: Date): Promise<void>;
  /** The newest live session, as the setup holder sees it. */
  findConnection(now: Date): Promise<ExternalAgentConnection | null>;
}

/** A session that may call now. */
export interface LiveExternalAgentSession {
  id: string;
}

export function externalAgentRepository(db: Orm | Tx): ExternalAgentRepository {
  const orm = () => ormOf(db);

  return {
    insertCode: async (code) => {
      await orm().insert(externalAgentCodes).values(code);
    },

    useCode: async (secretHash, now) => {
      const [row] = await orm()
        .update(externalAgentCodes)
        .set({ usedAt: now })
        .where(
          and(
            eq(externalAgentCodes.secretHash, secretHash),
            isNull(externalAgentCodes.usedAt),
            isNull(externalAgentCodes.cancelledAt),
            gt(externalAgentCodes.expiresAt, now),
          ),
        )
        .returning({ id: externalAgentCodes.id });
      return row !== undefined;
    },

    cancelUnusedCodes: async (now) => {
      await orm()
        .update(externalAgentCodes)
        .set({ cancelledAt: now })
        .where(and(isNull(externalAgentCodes.usedAt), isNull(externalAgentCodes.cancelledAt)));
    },

    insertSession: async (session) => {
      await orm().insert(externalAgentSessions).values(session);
    },

    findLiveSession: async (tokenHash, now) => {
      const [row] = await orm()
        .select({ id: externalAgentSessions.id })
        .from(externalAgentSessions)
        .where(and(eq(externalAgentSessions.tokenHash, tokenHash), isLiveSession(now)));
      return row ?? null;
    },

    lockLiveSession: async (id, now) => {
      const [row] = await orm()
        .select({ id: externalAgentSessions.id })
        .from(externalAgentSessions)
        .where(and(eq(externalAgentSessions.id, id), isLiveSession(now)))
        .for("update");
      return row ?? null;
    },

    endSessions: async (now) => {
      await orm()
        .update(externalAgentSessions)
        .set({ endedAt: now })
        .where(isNull(externalAgentSessions.endedAt));
    },

    recordCall: async (id, now) => {
      await orm()
        .update(externalAgentSessions)
        .set({ lastCallAt: now })
        .where(
          and(
            eq(externalAgentSessions.id, id),
            isNull(externalAgentSessions.endedAt),
            or(
              isNull(externalAgentSessions.lastCallAt),
              lt(externalAgentSessions.lastCallAt, new Date(now.getTime() - CALL_RECORD_MS)),
            ),
          ),
        );
    },

    findConnection: async (now) => {
      const [row] = await orm()
        .select({
          client: externalAgentSessions.client,
          connectedAt: externalAgentSessions.createdAt,
          lastCallAt: externalAgentSessions.lastCallAt,
          expiresAt: externalAgentSessions.expiresAt,
        })
        .from(externalAgentSessions)
        .where(isLiveSession(now))
        .orderBy(desc(externalAgentSessions.createdAt))
        .limit(1);
      return row ?? null;
    },
  };
}

/** How often a session's last call is recorded at most, so calls rarely write. */
const CALL_RECORD_MS = 60_000;

/** The sessions that have not ended and not expired at `now`. */
function isLiveSession(now: Date) {
  return and(isNull(externalAgentSessions.endedAt), gt(externalAgentSessions.expiresAt, now));
}
