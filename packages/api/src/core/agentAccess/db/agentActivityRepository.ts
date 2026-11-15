import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";

import { type Orm, ormOf, type Tx } from "../../db";
import type { KeysetRow } from "../../pagination";
import type { AgentActivityOutcome } from "../domain";
import { agentActivity } from "./agentActivityTable";

/** People's agent activity: one line per tool call of their agent. */
export interface AgentActivityRepository {
  insert(userId: string, line: NewAgentActivity): Promise<void>;
  /** Up to `limit` of the person's lines, newest first, older than the line `after`. */
  findPage(
    userId: string,
    page: { after: AgentActivitySortValues | null; limit: number },
  ): Promise<KeysetRow<StoredAgentActivity, AgentActivitySortValues>[]>;
  /** Deletes everyone's lines from before `cutoff`. */
  deleteCalledBefore(cutoff: Date): Promise<void>;
}

export interface StoredAgentActivity {
  id: string;
  clientId: string;
  tool: string;
  outcome: AgentActivityOutcome;
  /** How many records the call returned, for tools that count; null otherwise. */
  resultCount: number | null;
  calledAt: Date;
}

export type NewAgentActivity = Omit<StoredAgentActivity, "id">;

/** A line's sort values in a cursor: its id. */
export type AgentActivitySortValues = [string];

// Eighteen digits always fit the signed 64-bit id; a longer one is no cursor this API issued.
export const AGENT_ACTIVITY_SORT_VALUES = z.tuple([z.string().regex(/^\d{1,18}$/)]);

export function agentActivityRepository(db: Orm | Tx): AgentActivityRepository {
  const orm = () => ormOf(db);
  return {
    async insert(userId, line) {
      await orm()
        .insert(agentActivity)
        .values({ userId, ...line });
    },
    async findPage(userId, { after, limit }) {
      const rows = await orm()
        .select({
          id: agentActivity.id,
          clientId: agentActivity.clientId,
          tool: agentActivity.tool,
          outcome: agentActivity.outcome,
          resultCount: agentActivity.resultCount,
          calledAt: agentActivity.calledAt,
        })
        .from(agentActivity)
        .where(
          and(
            eq(agentActivity.userId, userId),
            after ? lt(agentActivity.id, BigInt(after[0])) : undefined,
          ),
        )
        .orderBy(desc(agentActivity.id))
        .limit(limit);
      return rows.map(({ id, ...line }) => ({
        node: { id: String(id), ...line },
        values: [String(id)],
      }));
    },
    async deleteCalledBefore(cutoff) {
      await orm().delete(agentActivity).where(lt(agentActivity.calledAt, cutoff));
    },
  };
}
