import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import {
  chooseAgentSource,
  lockAgentChoice,
  lockSetupOpenToAgent,
  readSetupOpenToAgent,
} from "../../../core/instance";
import { PrincipalSecurityContext, type SecurityContext } from "../../../core/security";
import { agentRepository } from "../db";
import {
  AGENT_CODE_HOURS,
  AGENT_SESSION_HOURS,
  type AgentConnection,
  type AgentWay,
  hashAgentSecret,
  hoursAfter,
  isAgentSafeOrigin,
  newAgentSecret,
  parseClientName,
} from "../domain";
import type { AgentContext } from "./agentContext";

/**
 * The owner's external agent connecting during setup: the setup holder chooses it and makes a
 * one-time code; the agent trades the code for its session; the setup holder ends it. One agent
 * at a time: choosing, a new code and Disconnect end every session and cancel every unused code.
 */
export interface AgentSessionService {
  /** Makes the external agent the AI source, ending any agent session. */
  chooseAgent(ctx: SecurityContext): Promise<void>;
  /** A new one-time code for this way, shown once; refused with CONFLICT on an unsafe origin. */
  createAgentCode(ctx: SecurityContext, request: AgentCodeRequest): Promise<AgentCode>;
  /** The session for a live code, used up by this call; UNAUTHENTICATED for any other code. */
  startAgentSession(ctx: SecurityContext, request: AgentSessionRequest): Promise<AgentSession>;
  /** The external agent's security context for a live session's token; null for any other token. */
  readAgentSession(request: { token: string }): Promise<SecurityContext | null>;
  /** Ends the agent's session; its next call is refused. */
  disconnectAgent(ctx: SecurityContext): Promise<void>;
  /** The connected agent, or null when none is. */
  readAgentConnection(ctx: SecurityContext): Promise<AgentConnection | null>;
  /** The code waiting to be exchanged, without its secret; null when none waits. */
  readPendingAgentCode(ctx: SecurityContext): Promise<Omit<AgentCode, "code"> | null>;
}

export interface AgentCodeRequest {
  way: AgentWay;
  /** The setup holder's browser origin, which the agent will be told to call. */
  origin: string | null;
}

export interface AgentCode {
  code: string;
  way: AgentWay;
  expiresAt: Date;
}

export interface AgentSessionRequest {
  code: string;
  /** The name the agent gives itself. */
  client: unknown;
}

export interface AgentSession {
  token: string;
  way: AgentWay;
  expiresAt: Date;
}

export function createAgentSessionService(context: AgentContext): AgentSessionService {
  const { orm, transact, clock } = context;
  return {
    chooseAgent: async (ctx) => {
      await transact(async (tx) => {
        await chooseAgentSource(ctx, tx);
        await endAgents(tx, clock());
      });
    },

    createAgentCode: async (ctx, { way, origin }) => {
      ctx.requireSetupAccess();
      if (!isAgentSafeOrigin(origin)) {
        throw new ApplicationError(
          "CONFLICT",
          "Your agent needs Broccoli on https or on this computer.",
        );
      }
      return transact(async (tx) => {
        const now = await lockSetupOpenToAgent(tx, clock);
        if (!now) {
          throw new ApplicationError("CONFLICT", "Choose your agent first.");
        }
        await endAgents(tx, now);
        const code = newAgentSecret();
        const expiresAt = hoursAfter(now, AGENT_CODE_HOURS);
        await agentRepository(tx).insertCode({ secretHash: hashAgentSecret(code), way, expiresAt });
        return { code, way, expiresAt };
      });
    },

    startAgentSession: async (ctx, { code, client }) => {
      ctx.requireOwnerOrSystem();
      return transact(async (tx) => {
        const now = await lockSetupOpenToAgent(tx, clock);
        const way = now && (await agentRepository(tx).useCode(hashAgentSecret(code), now));
        if (!now || !way) {
          throw new ApplicationError("UNAUTHENTICATED", "The code is not valid.");
        }
        const token = newAgentSecret();
        const expiresAt = hoursAfter(now, AGENT_SESSION_HOURS);
        await agentRepository(tx).insertSession({
          tokenHash: hashAgentSecret(token),
          way,
          client: parseClientName(client),
          expiresAt,
        });
        return { token, way, expiresAt };
      });
    },

    readAgentSession: async ({ token }) => {
      const now = clock();
      const session = await agentRepository(orm).findLiveSession(hashAgentSecret(token), now);
      if (!session || !(await readSetupOpenToAgent(orm, now))) {
        return null;
      }
      await agentRepository(orm).recordCall(session.id, now);
      return PrincipalSecurityContext.setupAgent(session.id);
    },

    disconnectAgent: async (ctx) => {
      await transact(async (tx) => {
        await lockAgentChoice(ctx, tx);
        await endAgents(tx, clock());
      });
    },

    readPendingAgentCode: async (ctx) => {
      ctx.requireSetupAccess();
      const now = clock();
      return (await readSetupOpenToAgent(orm, now))
        ? agentRepository(orm).findPendingCode(now)
        : null;
    },

    readAgentConnection: async (ctx) => {
      ctx.requireSetupAccess();
      const now = clock();
      return (await readSetupOpenToAgent(orm, now))
        ? agentRepository(orm).findConnection(now)
        : null;
    },
  };
}

/** Ends every agent session and cancels every unused code: one agent at a time. */
async function endAgents(tx: Tx, now: Date): Promise<void> {
  const agents = agentRepository(tx);
  await agents.cancelUnusedCodes(now);
  await agents.endSessions(now);
}
