import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { AgentConnection, AgentWay } from "../domain";
import { agentCodes } from "./agentCodesTable";
import { agentSessions } from "./agentSessionsTable";

/** Agent one-time codes and agent sessions, through the pool or inside a transaction. */
export interface AgentRepository {
  insertCode(code: { secretHash: string; way: AgentWay; expiresAt: Date }): Promise<void>;
  /**
   * Marks the live code with this hash used at `now` and returns its way; null for a code that is
   * unknown, used, cancelled or expired. Of two concurrent calls with one code, one gets the way.
   */
  useCode(secretHash: string, now: Date): Promise<AgentWay | null>;
  /** The newest code that can still be exchanged at `now`: its way and expiry, never its hash. */
  findPendingCode(now: Date): Promise<{ way: AgentWay; expiresAt: Date } | null>;
  /** Cancels every code not yet used, so none can be exchanged any more. */
  cancelUnusedCodes(now: Date): Promise<void>;
  insertSession(session: {
    tokenHash: string;
    way: AgentWay;
    client: string;
    expiresAt: Date;
  }): Promise<void>;
  /** The session with this token hash, while it is neither ended nor expired. */
  findLiveSession(tokenHash: string, now: Date): Promise<LiveAgentSession | null>;
  /** The session with this id, locked until the transaction ends, while it is live. */
  lockLiveSession(id: string, now: Date): Promise<LiveAgentSession | null>;
  /** Ends every session that has not ended, whether it is live, idle or expired. */
  endSessions(now: Date): Promise<void>;
  /** Records a call of a session that has not ended, at most once a minute. */
  recordCall(id: string, now: Date): Promise<void>;
  /** The newest live session, as the setup holder sees it. */
  findConnection(now: Date): Promise<AgentConnection | null>;
}

/** A session that may call now. */
export interface LiveAgentSession {
  id: string;
  way: AgentWay;
}

export function agentRepository(db: Orm | Tx): AgentRepository {
  const orm = () => ormOf(db);
  const live = (now: Date) => and(isNull(agentSessions.endedAt), gt(agentSessions.expiresAt, now));

  return {
    insertCode: async (code) => {
      await orm().insert(agentCodes).values(code);
    },

    useCode: async (secretHash, now) => {
      const [row] = await orm()
        .update(agentCodes)
        .set({ usedAt: now })
        .where(
          and(
            eq(agentCodes.secretHash, secretHash),
            isNull(agentCodes.usedAt),
            isNull(agentCodes.cancelledAt),
            gt(agentCodes.expiresAt, now),
          ),
        )
        .returning({ way: agentCodes.way });
      return row?.way ?? null;
    },

    findPendingCode: async (now) => {
      const [row] = await orm()
        .select({ way: agentCodes.way, expiresAt: agentCodes.expiresAt })
        .from(agentCodes)
        .where(
          and(
            isNull(agentCodes.usedAt),
            isNull(agentCodes.cancelledAt),
            gt(agentCodes.expiresAt, now),
          ),
        )
        .orderBy(desc(agentCodes.createdAt))
        .limit(1);
      return row ?? null;
    },

    cancelUnusedCodes: async (now) => {
      await orm()
        .update(agentCodes)
        .set({ cancelledAt: now })
        .where(and(isNull(agentCodes.usedAt), isNull(agentCodes.cancelledAt)));
    },

    insertSession: async (session) => {
      await orm().insert(agentSessions).values(session);
    },

    findLiveSession: async (tokenHash, now) => {
      const [row] = await orm()
        .select({ id: agentSessions.id, way: agentSessions.way })
        .from(agentSessions)
        .where(and(eq(agentSessions.tokenHash, tokenHash), live(now)));
      return row ?? null;
    },

    lockLiveSession: async (id, now) => {
      const [row] = await orm()
        .select({ id: agentSessions.id, way: agentSessions.way })
        .from(agentSessions)
        .where(and(eq(agentSessions.id, id), live(now)))
        .for("update");
      return row ?? null;
    },

    endSessions: async (now) => {
      await orm().update(agentSessions).set({ endedAt: now }).where(isNull(agentSessions.endedAt));
    },

    recordCall: async (id, now) => {
      await orm()
        .update(agentSessions)
        .set({ lastCallAt: now })
        .where(
          and(
            eq(agentSessions.id, id),
            isNull(agentSessions.endedAt),
            or(
              isNull(agentSessions.lastCallAt),
              lt(agentSessions.lastCallAt, new Date(now.getTime() - CALL_RECORD_MS)),
            ),
          ),
        );
    },

    findConnection: async (now) => {
      const [row] = await orm()
        .select({
          client: agentSessions.client,
          way: agentSessions.way,
          connectedAt: agentSessions.createdAt,
          lastCallAt: agentSessions.lastCallAt,
          expiresAt: agentSessions.expiresAt,
        })
        .from(agentSessions)
        .where(live(now))
        .orderBy(desc(agentSessions.createdAt))
        .limit(1);
      return row ?? null;
    },
  };
}

/** How often a session's last call is recorded at most, so calls rarely write. */
const CALL_RECORD_MS = 60_000;
