import type { Orm, Transact } from "../../db";
import type { Logger } from "../../logger";
import { type Connection, type PageArgs, paginate } from "../../pagination";
import type { SecurityContext } from "../../security";
import {
  AGENT_ACTIVITY_SORT_VALUES,
  agentActivityRepository,
  type StoredAgentActivity,
} from "../db";
import type { AgentActivityOutcome } from "../domain";
import { agentUserOf } from "./agentUserOf";

/** How long a line of agent activity is kept: as long as an unused connection lasts. */
const ACTIVITY_KEPT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What a person's agent did: one line per tool call, recorded as it happens and kept 30 days. */
export interface AgentActivityService {
  /** Records one tool call of the caller's agent and nudges their open pages; a failure to save is logged, never thrown. */
  recordCall: (ctx: SecurityContext, call: AgentCall) => Promise<void>;
  /** The caller's agent activity, newest first, paged; empty for a caller who is no user. */
  listMyActivity: (
    ctx: SecurityContext,
    page: PageArgs,
  ) => Promise<Connection<StoredAgentActivity>>;
  /** Deletes everyone's activity older than 30 days. */
  deleteOldActivity: (ctx: SecurityContext) => Promise<void>;
}

export interface AgentCall {
  clientId: string;
  tool: string;
  outcome: AgentActivityOutcome;
  /** How many records the call returned, for tools that count; null otherwise. */
  resultCount: number | null;
}

export function createAgentActivityService({
  orm,
  transact,
  logger,
}: {
  orm: Orm;
  transact: Transact;
  logger: Logger;
}): AgentActivityService {
  return {
    async recordCall(ctx, call) {
      const userId = ctx.user?.userId;
      if (!userId) {
        return;
      }
      try {
        await transact(async (tx) => {
          await agentActivityRepository(tx).insert(userId, { ...call, calledAt: new Date() });
          tx.publish("agentAccess.activity_recorded", { userId });
        });
      } catch {
        // The agent still gets its answer; the person's page only misses this line.
        logger.warn({ tool: call.tool, userId }, "Agent activity not saved");
      }
    },
    async listMyActivity(ctx, page) {
      const userId = agentUserOf(ctx);
      return paginate(page, {
        order: { field: "NEWEST", direction: "DESC" },
        keysetValues: { NEWEST: AGENT_ACTIVITY_SORT_VALUES },
        fetch: async ({ after, limit }) =>
          userId ? agentActivityRepository(orm).findPage(userId, { after, limit }) : [],
      });
    },
    async deleteOldActivity(ctx) {
      ctx.requireSystem();
      const cutoff = new Date(Date.now() - ACTIVITY_KEPT_DAYS * DAY_MS);
      await agentActivityRepository(orm).deleteCalledBefore(cutoff);
    },
  };
}
