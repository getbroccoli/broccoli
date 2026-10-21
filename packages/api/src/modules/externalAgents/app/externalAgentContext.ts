import { ApplicationError } from "../../../core/applicationError";
import type { Orm, Transact, Tx } from "../../../core/db";
import { lockSetupOpenToExternalAgent } from "../../../core/instance";
import type { SecurityContext } from "../../../core/security";
import type { ImportUseCases } from "../../imports";
import { externalAgentRepository } from "../db";
import type { ExternalAgentActivity } from "./externalAgentActivity";

/** What the external agent's use cases share. */
export interface ExternalAgentContext {
  orm: Orm;
  transact: Transact;
  /** The import, which the agent's files go into. */
  imports: Pick<ImportUseCases, "answeredMapping" | "originalFileReads">;
  /** Now; tests pass their own. */
  clock: () => Date;
  activity: ExternalAgentActivity;
}

/**
 * Runs `work` for the calling external agent in one transaction, holding the instance row and
 * the agent's session so neither changes meanwhile: refused with UNAUTHENTICATED once the session
 * or setup's openness to the agent has ended.
 */
export function asLiveExternalAgent<T>(
  { transact, clock, activity }: ExternalAgentContext,
  ctx: SecurityContext,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  const sessionId = ctx.requireSetupExternalAgent();
  return transact(async (tx) => {
    const now = await lockSetupOpenToExternalAgent(tx, clock);
    const live = now && (await externalAgentRepository(tx).lockLiveSession(sessionId, now));
    if (!live) {
      throw new ApplicationError("UNAUTHENTICATED", "Your agent's session ended.");
    }
    activity.recordCall(now);
    return work(tx);
  });
}
