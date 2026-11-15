import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type {
  AgentActivityOutcome,
  AgentActivityService,
  AgentScope,
} from "../../../core/agentAccess";
import { ApplicationError } from "../../../core/applicationError";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import type { McpAgentToolService } from "../app";

/** Longer than any name or email a person searches for. */
const MAX_SEARCH_LENGTH = 100;

/** Each tool an agent may call, with the scope its token must hold; nothing else is offered. */
export const MCP_AGENT_TOOLS: Record<string, { scope: AgentScope }> = {
  who_am_i: { scope: "broccoli:read" },
  find_people: { scope: "broccoli:read" },
};

const PERSON = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  jobTitle: z.string().nullable(),
});

/** The person an agent's call acts for, and which agent it is. */
export interface AgentCaller {
  ctx: SecurityContext;
  clientId: string;
}

/** Adds the tools to `server`, each acting as the person behind `caller` and recording its call. */
export function registerMcpAgentTools(
  server: McpServer,
  caller: AgentCaller,
  dependencies: { tools: McpAgentToolService; activity: AgentActivityService; logger: Logger },
): void {
  const { ctx } = caller;
  const { tools } = dependencies;
  const run = <T extends object>(call: ToolCall<T>) => resultOf(call, caller, dependencies);
  server.registerTool(
    "who_am_i",
    {
      title: "Who am I",
      description:
        "The person you act for in Broccoli: their email, permission profiles, employee record and manager.",
      outputSchema: {
        email: z.string(),
        permissionProfiles: z.array(z.string()),
        employee: PERSON.nullable(),
        manager: PERSON.nullable(),
      },
      annotations: { readOnlyHint: true },
    },
    () => run({ tool: "who_am_i", answer: () => tools.whoAmI(ctx) }),
  );
  server.registerTool(
    "find_people",
    {
      title: "Find people",
      description:
        "People in the company the person may see, sorted by name, 25 at a time. Search by name or email; pass nextCursor as after for the next page.",
      inputSchema: {
        search: z.string().max(MAX_SEARCH_LENGTH).optional(),
        after: z.string().optional(),
      },
      outputSchema: { people: z.array(PERSON), nextCursor: z.string().nullable() },
      annotations: { readOnlyHint: true },
    },
    (input) =>
      run({
        tool: "find_people",
        answer: () => tools.findPeople(ctx, input),
        countOf: (found) => found.people.length,
      }),
  );
}

/** One tool call: its answer, and how many records it returned for tools that count. */
interface ToolCall<T> {
  tool: string;
  answer: () => Promise<T>;
  countOf?: (value: T) => number;
}

/**
 * The tool's answer; a refusal the person may read, or a failure that hides its cause. Records how
 * it ended as the person's agent activity.
 */
async function resultOf<T extends object>(
  { tool, answer, countOf }: ToolCall<T>,
  { ctx, clientId }: AgentCaller,
  { activity, logger }: { activity: AgentActivityService; logger: Logger },
) {
  const userId = ctx.user?.userId;
  const record = (outcome: AgentActivityOutcome, resultCount: number | null = null) =>
    activity.recordCall(ctx, { clientId, tool, outcome, resultCount });
  try {
    const value = await answer();
    await record("answered_by_broccoli", countOf ? countOf(value) : null);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(value) }],
      structuredContent: value as Record<string, unknown>,
    };
  } catch (error) {
    if (error instanceof ApplicationError) {
      logger.warn({ tool, userId, code: error.code }, "MCP tool refused");
      await record("refused_by_broccoli");
    } else {
      // Only the name: a message may carry the data the tool read.
      logger.error({ error: (error as Error).name, tool, userId }, "MCP tool failed");
      await record("failed_in_broccoli");
    }
    const message =
      error instanceof ApplicationError ? error.message : "Broccoli could not answer; try again.";
    return { content: [{ type: "text" as const, text: message }], isError: true };
  }
}
