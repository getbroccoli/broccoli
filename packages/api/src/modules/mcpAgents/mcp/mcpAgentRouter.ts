import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { rateLimit } from "express-rate-limit";

import { agentResourceMetadataOf, type AgentSecurityResolver } from "../../../core/agentAccess";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import type { McpAgentToolService } from "../app";
import { MCP_AGENT_TOOLS, registerMcpAgentTools } from "./mcpAgentTools";

/** Small enough to refuse anything but a tool call. */
const MAX_BODY_BYTES = 64 * 1024;
/** Far more than an agent answering a person's questions needs. */
const CALLS_PER_PERSON_PER_MINUTE = 120;
/** Room for a few people's agents behind one address; bounds token guessing from it. */
const CALLS_PER_ADDRESS_PER_MINUTE = 600;
/** What the agent reads when it connects: who it acts for and its limits. */
const INSTRUCTIONS =
  "🥦 You're in Broccoli, acting as the signed-in person. Start with who_am_i. You see only what they can and never approve anything. Begin every answer that uses Broccoli with 🥦.";

/**
 * `POST /api/mcp`: the MCP server people's own agents call, stateless, by the agent's bearer
 * token alone, acting as the person. A cookie never counts here. Answers are never cached.
 */
export function mcpAgentRouter(
  publicOrigin: (request: express.Request) => Promise<string>,
  resolveAgentSecurity: AgentSecurityResolver,
  { tools, logger }: { tools: McpAgentToolService; logger: Logger },
): express.Router {
  const perPerson = rateLimit({
    windowMs: 60_000,
    limit: CALLS_PER_PERSON_PER_MINUTE,
    keyGenerator: (_request, response) => agentOf(response).user!.userId,
  });
  // Mounted under `/api`, so this is `MCP_PATH`.
  return express
    .Router()
    .all("/mcp", (request, response, next) => {
      response.set("Cache-Control", "no-store");
      if (request.method !== "POST") {
        response.set("Allow", "POST").sendStatus(405);
        return;
      }
      next();
    })
    .post(
      "/mcp",
      rateLimit({
        windowMs: 60_000,
        limit: CALLS_PER_ADDRESS_PER_MINUTE,
        // Without a trusted proxy the socket address counts; a forwarded header is ignored.
        validate: { xForwardedForHeader: false },
      }),
      express.json({ limit: MAX_BODY_BYTES }),
      refuseBatches,
      asAgent(publicOrigin, resolveAgentSecurity, logger),
      perPerson,
      async (request, response) => {
        const server = new McpServer(
          { name: "broccoli", version: "1" },
          { instructions: INSTRUCTIONS },
        );
        registerMcpAgentTools(server, agentOf(response), { tools, logger });
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        response.on("close", () => {
          void transport.close();
          void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(request, response, request.body);
      },
    )
    .use(mcpErrorHandler(logger));
}

/**
 * Answers a body that is no JSON, or too large, as JSON-RPC does; any other failure logs only its
 * name, since a parser's message quotes the request.
 */
function mcpErrorHandler(logger: Logger): express.ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    const type = (error as { type?: unknown }).type;
    if (type === "entity.parse.failed" || type === "entity.too.large") {
      const status = type === "entity.too.large" ? 413 : 400;
      response.status(status).json({
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      });
      return;
    }
    logger.error({ error: (error as Error).name }, "MCP call failed");
    response
      .status(500)
      .json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
  };
}

/** One request at a time, so each tool call is checked for its scope; MCP has no batches. */
const refuseBatches: express.RequestHandler = (request, response, next) => {
  if (Array.isArray(request.body)) {
    response.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Batches are not supported" },
      id: null,
    });
    return;
  }
  next();
};

/**
 * Lets the call through as the person its token acts for, when the token holds the tool's scope;
 * otherwise answers with the challenge that tells the agent how to get a better one.
 */
function asAgent(
  publicOrigin: (request: express.Request) => Promise<string>,
  resolveAgentSecurity: AgentSecurityResolver,
  logger: Logger,
): express.RequestHandler {
  return async (request, response, next) => {
    const origin = await publicOrigin(request);
    const metadata = `resource_metadata="${agentResourceMetadataOf(origin)}"`;
    const agent = await resolveAgentSecurity(request.headers, origin);
    if ("refusal" in agent) {
      logger.warn({ reason: agent.refusal }, "MCP call refused");
      const error = agent.refusal === "NO_TOKEN" ? "" : 'error="invalid_token", ';
      refuse(response, 401, `Bearer ${error}${metadata}`);
      return;
    }
    const scope = requiredScopeOf(request.body);
    if (scope && !agent.scopes.has(scope)) {
      logger.warn(
        { reason: "INSUFFICIENT_SCOPE", userId: agent.security.user?.userId },
        "MCP call refused",
      );
      refuse(response, 403, `Bearer error="insufficient_scope", scope="${scope}", ${metadata}`);
      return;
    }
    (response.locals as AgentLocals).agent = agent.security;
    next();
  };
}

interface AgentLocals {
  agent: SecurityContext;
}

/** The security context `asAgent` resolved for this call. */
function agentOf(response: express.Response): SecurityContext {
  return (response.locals as AgentLocals).agent;
}

/** The scope a tool call needs; null for a request that runs no tool, such as a tools list. */
function requiredScopeOf(body: unknown): string | null {
  const { method, params } = (body ?? {}) as { method?: unknown; params?: { name?: unknown } };
  if (method !== "tools/call") {
    return null;
  }
  const tool = typeof params?.name === "string" ? MCP_AGENT_TOOLS[params.name] : undefined;
  return tool?.scope ?? null;
}

function refuse(response: express.Response, status: 401 | 403, challenge: string): void {
  response
    .status(status)
    .set("WWW-Authenticate", challenge)
    .json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
}
