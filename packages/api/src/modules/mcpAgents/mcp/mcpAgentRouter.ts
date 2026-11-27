import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { rateLimit } from "express-rate-limit";

import {
  type AgentActivityService,
  agentResourceMetadataOf,
  type AgentSecurityResolver,
} from "../../../core/agentAccess";
import type { Logger } from "../../../core/logger";
import type { McpAgentToolService } from "../app";
import { type AgentCaller, MCP_AGENT_TOOLS, registerMcpAgentTools } from "./mcpAgentTools";

/** Small enough to refuse anything but a tool call. */
const MAX_BODY_BYTES = 64 * 1024;
/** Far more than an agent answering a person's questions needs. */
const CALLS_PER_PERSON_PER_MINUTE = 120;
/** Room for a few people's agents behind one address; bounds token guessing from it. */
const CALLS_PER_ADDRESS_PER_MINUTE = 600;
/** What the agent reads when it connects: who it acts for and its limits. */
const INSTRUCTIONS = [
  "🥦 You're in Broccoli, acting as the signed-in person: you see and change only what they can.",
  "Start with who_am_i; it gives today's date for working out dates.",
  "Before request_leave, always call preview_leave, show the person the days, the total and the balance after, and ask them to confirm; pass the previewed totalDays as expectedDays.",
  "To decide a task such as an approval, call show_approval: the person presses a button on its card. You never decide yourself. Also give the person the task's link, since not every chat shows the card.",
  "Begin every answer that uses Broccoli with 🥦.",
].join(" ");

/**
 * `POST /api/mcp`: the MCP server people's own agents call, stateless, by the agent's bearer
 * token alone, acting as the person. A cookie never counts here. Answers are never cached.
 */
export function mcpAgentRouter(
  publicOrigin: (request: express.Request) => Promise<string>,
  resolveAgentSecurity: AgentSecurityResolver,
  {
    tools,
    activity,
    logger,
  }: { tools: McpAgentToolService; activity: AgentActivityService; logger: Logger },
): express.Router {
  const perPerson = rateLimit({
    windowMs: 60_000,
    limit: CALLS_PER_PERSON_PER_MINUTE,
    keyGenerator: (_request, response) => agentOf(response).ctx.user!.userId,
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
      asAgent(publicOrigin, resolveAgentSecurity, { activity, logger }),
      perPerson,
      answerWithTools({ tools, activity, logger }),
    )
    .use(mcpErrorHandler(logger));
}

/**
 * Answers the call with a fresh MCP server holding the tools, acting as the call's person. A tool
 * call the server refused before the tool ran, such as for invalid input, is recorded as refused.
 */
function answerWithTools({
  tools,
  activity,
  logger,
}: {
  tools: McpAgentToolService;
  activity: AgentActivityService;
  logger: Logger;
}): express.RequestHandler {
  return async (request, response) => {
    const caller = agentOf(response);
    let recorded = false;
    const recording: AgentActivityService = {
      ...activity,
      recordCall: (ctx, call) => {
        recorded = true;
        return activity.recordCall(ctx, call);
      },
    };
    const server = new McpServer(
      { name: "broccoli", version: "1" },
      { instructions: INSTRUCTIONS },
    );
    registerMcpAgentTools(server, caller, { tools, activity: recording, logger });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const tool = toolCalledBy(request.body);
    const send = transport.send.bind(transport);
    // Before the answer leaves, so the person's page never reads ahead of the line.
    transport.send = async (message, options) => {
      if (tool && !recorded) {
        await recording.recordCall(caller.ctx, {
          clientId: caller.clientId,
          tool: tool.name,
          outcome: "refused_by_broccoli",
          resultCount: null,
        });
      }
      return send(message, options);
    };
    response.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  };
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
 * otherwise answers with the challenge that tells the agent how to get a better one, and records
 * the refused call.
 */
function asAgent(
  publicOrigin: (request: express.Request) => Promise<string>,
  resolveAgentSecurity: AgentSecurityResolver,
  { activity, logger }: { activity: AgentActivityService; logger: Logger },
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
    const tool = toolCalledBy(request.body);
    const { security: ctx, clientId } = agent;
    if (tool && !agent.scopes.has(tool.scope)) {
      logger.warn({ reason: "INSUFFICIENT_SCOPE", userId: ctx.user?.userId }, "MCP call refused");
      await activity.recordCall(ctx, {
        clientId,
        tool: tool.name,
        outcome: "refused_by_broccoli",
        resultCount: null,
      });
      // Asking for write alone would drop read from the tokens the agent gets next.
      const scope = tool.scope === "broccoli:write" ? "broccoli:read broccoli:write" : tool.scope;
      refuse(response, 403, `Bearer error="insufficient_scope", scope="${scope}", ${metadata}`);
      return;
    }
    (response.locals as AgentLocals).agent = { ctx, clientId, origin };
    next();
  };
}

interface AgentLocals {
  agent: AgentCaller;
}

/** The person and agent `asAgent` resolved for this call. */
function agentOf(response: express.Response): AgentCaller {
  return (response.locals as AgentLocals).agent;
}

/**
 * The offered tool a request calls, with the scope it needs; null for a request that runs none,
 * such as a tools list or an unknown tool.
 */
function toolCalledBy(body: unknown): { name: string; scope: string } | null {
  const { method, params } = (body ?? {}) as { method?: unknown; params?: { name?: unknown } };
  const name = params?.name;
  if (
    method !== "tools/call" ||
    typeof name !== "string" ||
    !Object.hasOwn(MCP_AGENT_TOOLS, name)
  ) {
    return null;
  }
  return { name, scope: MCP_AGENT_TOOLS[name]!.scope };
}

function refuse(response: express.Response, status: 401 | 403, challenge: string): void {
  response
    .status(status)
    .set("WWW-Authenticate", challenge)
    .json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
}
