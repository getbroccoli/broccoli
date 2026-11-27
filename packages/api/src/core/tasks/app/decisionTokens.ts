import { createHash, randomBytes } from "node:crypto";

import { ApplicationError } from "../../applicationError";
import type { Tx } from "../../db";
import { requireAgentWriteScope, type SecurityContext } from "../../security";
import { taskDecisionTokenRepository } from "../db";
import type { Task } from "../domain";

/** Long enough to read a card and press a button; the card asks to be shown again after it. */
const DECISION_TOKEN_MS = 60 * 60 * 1000;

const CANNOT_DECIDE =
  "Your agent can't decide this. Press the button on the card, or open the task in Broccoli.";

/**
 * A one-time token for deciding the task on a card in the caller's connected agent, stored in `tx`
 * while the caller holds the task's lock; the caller already checked that they may see it.
 */
export async function issueDecisionToken(
  tx: Tx,
  ctx: SecurityContext,
  { task, employeeId }: { task: Task; employeeId: string },
): Promise<{ token: string; expiresAt: Date }> {
  if (!ctx.agentConnection) {
    throw new ApplicationError("FORBIDDEN", "Only a connected agent shows a decision card.");
  }
  requireAgentWriteScope(ctx);
  task.requireDecidableBy(employeeId);
  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + DECISION_TOKEN_MS);
  // shortcut: used and expired rows stay until their task goes; a sweep job if cards become frequent.
  await taskDecisionTokenRepository(tx).insert({
    tokenHash: hashOf(token),
    taskId: task.id,
    userId: ctx.user!.userId,
    agentConnectionId: ctx.agentConnection.id,
    expiresAt,
  });
  return { token, expiresAt };
}

/**
 * Uses up the token of the card the person pressed, in the decision's transaction, so a decision
 * that rolls back leaves it unused; refuses any other token.
 */
export async function redeemDecisionToken(
  tx: Tx,
  ctx: SecurityContext,
  { taskId, token }: { taskId: string; token: string | null },
): Promise<void> {
  const agent = ctx.agentConnection!;
  requireAgentWriteScope(ctx);
  const stored = token ? await taskDecisionTokenRepository(tx).lockByHash(hashOf(token)) : null;
  const issuedForThis =
    stored !== null &&
    stored.usedAt === null &&
    stored.taskId === taskId &&
    stored.userId === ctx.user?.userId &&
    stored.agentConnectionId === agent.id;
  if (!issuedForThis) {
    throw new ApplicationError("FORBIDDEN", CANNOT_DECIDE);
  }
  const now = new Date();
  if (stored.expiresAt <= now) {
    throw new ApplicationError(
      "FORBIDDEN",
      "This card has expired. Ask your agent to show it again.",
    );
  }
  await taskDecisionTokenRepository(tx).markUsed(stored.id, now);
}

function hashOf(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
