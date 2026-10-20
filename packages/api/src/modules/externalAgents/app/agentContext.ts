import { ApplicationError } from "../../../core/applicationError";
import type { Orm, Transact, Tx } from "../../../core/db";
import { lockSetupOpenToAgent } from "../../../core/instance";
import type { SecurityContext } from "../../../core/security";
import type { ImportUseCases } from "../../imports";
import { agentRepository } from "../db";
import type { AgentWay } from "../domain";

/** What the external agent's use cases share. */
export interface AgentContext {
  orm: Orm;
  transact: Transact;
  /** The import, which the agent's files go into. */
  imports: Pick<ImportUseCases, "answeredMapping" | "parsedSources">;
  /** Now; tests pass their own. */
  clock: () => Date;
}

/**
 * Runs `work` for the calling external agent in one transaction, holding the instance row and
 * the agent's session so neither changes meanwhile: refused with UNAUTHENTICATED once the session
 * or setup's openness to the agent has ended, and with CONFLICT when the session works another way.
 */
export function asLiveAgent<T>(
  { transact, clock }: AgentContext,
  ctx: SecurityContext,
  way: AgentWay,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  const sessionId = ctx.requireSetupAgent();
  return transact(async (tx) => {
    const now = await lockSetupOpenToAgent(tx, clock);
    const session = now && (await agentRepository(tx).lockLiveSession(sessionId, now));
    if (!session) {
      throw new ApplicationError("UNAUTHENTICATED", "Your agent's session ended.");
    }
    if (session.way !== way) {
      throw new ApplicationError("CONFLICT", "Your agent's session works the other way.");
    }
    return work(tx);
  });
}
