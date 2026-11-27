import { eq } from "drizzle-orm";

import { ormOf, type Orm, type Tx } from "../../db";
import { taskDecisionTokens } from "./taskDecisionTokensTable";

/** Decision tokens by their hash; the token itself is never stored. */
export interface TaskDecisionTokenRepository {
  insert(token: NewDecisionToken): Promise<void>;
  /** The token with this hash, locked until the transaction ends; null when there is none. */
  lockByHash(tokenHash: string): Promise<StoredDecisionToken | null>;
  markUsed(id: string, now: Date): Promise<void>;
}

export type NewDecisionToken = Omit<StoredDecisionToken, "id" | "usedAt">;

export interface StoredDecisionToken {
  id: string;
  tokenHash: string;
  taskId: string;
  userId: string;
  agentConnectionId: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export function taskDecisionTokenRepository(db: Orm | Tx): TaskDecisionTokenRepository {
  const orm = () => ormOf(db);
  return {
    async insert(token) {
      await orm().insert(taskDecisionTokens).values(token);
    },
    async lockByHash(tokenHash) {
      const [row] = await orm()
        .select({
          id: taskDecisionTokens.id,
          tokenHash: taskDecisionTokens.tokenHash,
          taskId: taskDecisionTokens.taskId,
          userId: taskDecisionTokens.userId,
          agentConnectionId: taskDecisionTokens.agentConnectionId,
          expiresAt: taskDecisionTokens.expiresAt,
          usedAt: taskDecisionTokens.usedAt,
        })
        .from(taskDecisionTokens)
        .where(eq(taskDecisionTokens.tokenHash, tokenHash))
        .for("update");
      return row ?? null;
    },
    async markUsed(id, now) {
      await orm()
        .update(taskDecisionTokens)
        .set({ usedAt: now })
        .where(eq(taskDecisionTokens.id, id));
    },
  };
}
