import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import {
  chooseExternalAgentSource,
  lockExternalAgentChoice,
  lockSetupOpenToExternalAgent,
  readSetupOpenToExternalAgent,
} from "../../../core/instance";
import { PrincipalSecurityContext, type SecurityContext } from "../../../core/security";
import { externalAgentRepository } from "../db";
import {
  EXTERNAL_AGENT_CODE_HOURS,
  EXTERNAL_AGENT_SESSION_HOURS,
  type ExternalAgentConnection,
  hashExternalAgentSecret,
  hoursAfter,
  isExternalAgentSafeOrigin,
  newExternalAgentSecret,
  parseClientName,
} from "../domain";
import type { ExternalAgentContext } from "./externalAgentContext";

/**
 * The owner's external agent connecting during setup: the setup holder chooses it and makes a
 * one-time code; the agent trades the code for its session; the setup holder ends it. One agent
 * at a time: choosing, a new code and Disconnect end every session and cancel every unused code.
 */
export interface ExternalAgentSessionService {
  /** Makes the external agent the AI source, ending any agent session. */
  chooseExternalAgent(ctx: SecurityContext): Promise<void>;
  /** A new one-time code, shown once; refused with CONFLICT on an unsafe origin. */
  createExternalAgentCode(
    ctx: SecurityContext,
    request: ExternalAgentCodeRequest,
  ): Promise<ExternalAgentCode>;
  /** The session for a live code, used up by this call; UNAUTHENTICATED for any other code. */
  startExternalAgentSession(
    ctx: SecurityContext,
    request: ExternalAgentSessionRequest,
  ): Promise<ExternalAgentSession>;
  /** The external agent's security context for a live session's token; null for any other token. */
  readExternalAgentSession(request: { token: string }): Promise<SecurityContext | null>;
  /** Ends the agent's session; its next call is refused. */
  disconnectExternalAgent(ctx: SecurityContext): Promise<void>;
  /** The connected agent, or null when none is. */
  readExternalAgentConnection(ctx: SecurityContext): Promise<ExternalAgentConnection | null>;
}

export interface ExternalAgentCodeRequest {
  /** The setup holder's browser origin, which the agent will be told to call. */
  origin: string | null;
}

export interface ExternalAgentCode {
  code: string;
  expiresAt: Date;
}

export interface ExternalAgentSessionRequest {
  code: string;
  /** The name the agent gives itself. */
  client: unknown;
}

export interface ExternalAgentSession {
  token: string;
  expiresAt: Date;
}

export function createExternalAgentSessionService(
  context: ExternalAgentContext,
): ExternalAgentSessionService {
  const { orm, transact, clock } = context;
  return {
    chooseExternalAgent: async (ctx) => {
      await transact(async (tx) => {
        await chooseExternalAgentSource(ctx, tx);
        await endExternalAgents(tx, clock());
      });
    },

    createExternalAgentCode: async (ctx, { origin }) => {
      ctx.requireSetupAccess();
      if (!isExternalAgentSafeOrigin(origin)) {
        throw new ApplicationError(
          "CONFLICT",
          "Your agent needs Broccoli on https or on this computer.",
        );
      }
      return transact(async (tx) => {
        const now = await lockSetupOpenToExternalAgent(tx, clock);
        if (!now) {
          throw new ApplicationError("CONFLICT", "Choose your agent first.");
        }
        await endExternalAgents(tx, now);
        const code = newExternalAgentSecret();
        const expiresAt = hoursAfter(now, EXTERNAL_AGENT_CODE_HOURS);
        await externalAgentRepository(tx).insertCode({
          secretHash: hashExternalAgentSecret(code),
          expiresAt,
        });
        return { code, expiresAt };
      });
    },

    startExternalAgentSession: async (ctx, { code, client }) => {
      ctx.requireOwnerOrSystem();
      return transact(async (tx) => {
        const now = await lockSetupOpenToExternalAgent(tx, clock);
        if (
          !now ||
          !(await externalAgentRepository(tx).useCode(hashExternalAgentSecret(code), now))
        ) {
          throw new ApplicationError("UNAUTHENTICATED", "The code is not valid.");
        }
        const token = newExternalAgentSecret();
        const expiresAt = hoursAfter(now, EXTERNAL_AGENT_SESSION_HOURS);
        await externalAgentRepository(tx).insertSession({
          tokenHash: hashExternalAgentSecret(token),
          client: parseClientName(client),
          expiresAt,
        });
        return { token, expiresAt };
      });
    },

    readExternalAgentSession: async ({ token }) => {
      const now = clock();
      const session = await externalAgentRepository(orm).findLiveSession(
        hashExternalAgentSecret(token),
        now,
      );
      if (!session || !(await readSetupOpenToExternalAgent(orm, now))) {
        return null;
      }
      await externalAgentRepository(orm).recordCall(session.id, now);
      return PrincipalSecurityContext.setupExternalAgent(session.id);
    },

    disconnectExternalAgent: async (ctx) => {
      await transact(async (tx) => {
        await lockExternalAgentChoice(ctx, tx);
        await endExternalAgents(tx, clock());
      });
    },

    readExternalAgentConnection: async (ctx) => {
      ctx.requireSetupAccess();
      const now = clock();
      return (await readSetupOpenToExternalAgent(orm, now))
        ? externalAgentRepository(orm).findConnection(now)
        : null;
    },
  };
}

/** Ends every agent session and cancels every unused code: one agent at a time. */
async function endExternalAgents(tx: Tx, now: Date): Promise<void> {
  const agents = externalAgentRepository(tx);
  await agents.cancelUnusedCodes(now);
  await agents.endSessions(now);
}
