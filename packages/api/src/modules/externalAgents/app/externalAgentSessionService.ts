import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import {
  chooseExternalAgentSource,
  lockExternalAgentChoice,
  lockSetupOpenToExternalAgent,
  readSetupOpenToExternalAgent,
} from "../../../core/instance";
import { PrincipalSecurityContext, type SecurityContext } from "../../../core/security";
import { type ExternalAgentConnection, externalAgentRepository } from "../db";
import { hoursAfter, newExternalAgentSecret, parseExternalAgentClientName } from "../helpers";
import type { ExternalAgentContext } from "./externalAgentContext";

/**
 * The owner's external agent connecting during setup: the setup holder chooses it and makes a
 * one-time code; the agent trades the code for its session; the setup holder ends it. One agent
 * at a time: choosing, a new code and Disconnect end every session and cancel every unused code.
 */
export interface ExternalAgentSessionService {
  /** Makes the external agent the AI source, ending any agent session. */
  chooseExternalAgent(ctx: SecurityContext): Promise<void>;
  /** A new one-time code, shown once; refused with CONFLICT unless the agent is chosen. */
  createExternalAgentCode(ctx: SecurityContext): Promise<ExternalAgentCode>;
  /** The session for a live code, used up by this call; UNAUTHENTICATED for any other code. */
  startExternalAgentSession(
    ctx: SecurityContext,
    request: ExternalAgentSessionRequest,
  ): Promise<ExternalAgentSession>;
  /** The external agent's security context for a live session's token; null for any other token. */
  readExternalAgentSession(request: { token: string }): Promise<SecurityContext | null>;
  /** Ends the agent's session; its next call is refused. */
  disconnectExternalAgent(ctx: SecurityContext): Promise<void>;
  /** The connected agent and whether it listens for files now, or null when none is connected. */
  readExternalAgentConnection(
    ctx: SecurityContext,
  ): Promise<(ExternalAgentConnection & { listening: boolean }) | null>;
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
  context: Omit<ExternalAgentContext, "imports">,
): ExternalAgentSessionService {
  const { orm, transact, clock, activity } = context;
  return {
    chooseExternalAgent: async (ctx) => {
      await transact(async (tx) => {
        await chooseExternalAgentSource(ctx, tx);
        await endExternalAgents(tx, clock());
      });
    },

    createExternalAgentCode: async (ctx) => {
      ctx.requireSetupAccess();
      return transact(async (tx) => {
        const now = await lockSetupOpenToExternalAgent(tx, clock);
        if (!now) {
          throw new ApplicationError("CONFLICT", "Choose your agent first.");
        }
        const code = newExternalAgentSecret();
        const expiresAt = hoursAfter(now, EXTERNAL_AGENT_CODE_HOURS);
        await externalAgentRepository(tx).replaceCode({ secret: code, expiresAt }, now);
        return { code, expiresAt };
      });
    },

    startExternalAgentSession: async (ctx, { code, client }) => {
      ctx.requireOwnerOrSystem();
      return transact(async (tx) => {
        const now = await lockSetupOpenToExternalAgent(tx, clock);
        const session = now && {
          token: newExternalAgentSecret(),
          client: parseExternalAgentClientName(client),
          expiresAt: hoursAfter(now, EXTERNAL_AGENT_SESSION_HOURS),
        };
        if (!session || !(await externalAgentRepository(tx).exchangeCode(code, session, now))) {
          throw new ApplicationError("UNAUTHENTICATED", "The code is not valid.");
        }
        activity.recordCall(now);
        return { token: session.token, expiresAt: session.expiresAt };
      });
    },

    readExternalAgentSession: async ({ token }) => {
      const now = clock();
      const sessionId = await externalAgentRepository(orm).findLiveSession(token, now);
      if (!sessionId || !(await readSetupOpenToExternalAgent(orm, now))) {
        return null;
      }
      return PrincipalSecurityContext.setupExternalAgent(sessionId);
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
      const connection =
        (await readSetupOpenToExternalAgent(orm, now)) &&
        (await externalAgentRepository(orm).findConnection(now));
      return connection ? { ...connection, listening: activity.isListening(now) } : null;
    },
  };
}

/** Ends every agent session and cancels every unused code: one agent at a time. */
function endExternalAgents(tx: Tx, now: Date): Promise<void> {
  return externalAgentRepository(tx).endAll(now);
}

/** How long an agent one-time code may be exchanged, and how long the session it gives lasts. */
const EXTERNAL_AGENT_CODE_HOURS = 2;
const EXTERNAL_AGENT_SESSION_HOURS = 2;
