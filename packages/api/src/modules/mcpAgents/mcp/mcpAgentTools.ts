import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AgentScope } from "../../../core/agentAccess";
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

/** Adds the tools to `server`, each acting as the person behind `ctx`. */
export function registerMcpAgentTools(
  server: McpServer,
  ctx: SecurityContext,
  { tools, logger }: { tools: McpAgentToolService; logger: Logger },
): void {
  const run = <T extends object>(tool: string, answer: () => Promise<T>) =>
    resultOf(tool, answer, { userId: ctx.user?.userId, logger });
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
    () => run("who_am_i", () => tools.whoAmI(ctx)),
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
    (input) => run("find_people", () => tools.findPeople(ctx, input)),
  );
}

/** The tool's answer; a refusal the person may read, or a failure that hides its cause. */
async function resultOf<T extends object>(
  tool: string,
  answer: () => Promise<T>,
  { userId, logger }: { userId: string | undefined; logger: Logger },
) {
  try {
    const value = await answer();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(value) }],
      structuredContent: value as Record<string, unknown>,
    };
  } catch (error) {
    if (!(error instanceof ApplicationError)) {
      // Only the name: a message may carry the data the tool read.
      logger.error({ error: (error as Error).name, tool, userId }, "MCP tool failed");
    }
    const message =
      error instanceof ApplicationError ? error.message : "Broccoli could not answer; try again.";
    return { content: [{ type: "text" as const, text: message }], isError: true };
  }
}
