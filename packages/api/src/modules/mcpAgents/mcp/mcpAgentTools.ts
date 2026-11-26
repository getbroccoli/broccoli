import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AgentActivityOutcome, AgentActivityService } from "../../../core/agentAccess";
import { ApplicationError } from "../../../core/applicationError";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import type { McpAgentToolService } from "../app";
import {
  FIND_PEOPLE,
  LIST_MY_TASKS,
  MY_LEAVE_BALANCE,
  PREVIEW_LEAVE,
  REQUEST_LEAVE,
  WHO_AM_I,
} from "./mcpAgentToolDefinitions";

export { MCP_AGENT_TOOLS } from "./mcpAgentToolDefinitions";

/** The person an agent's call acts for, which agent it is, and where it reached Broccoli. */
export interface AgentCaller {
  ctx: SecurityContext;
  clientId: string;
  origin: string;
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
  server.registerTool("who_am_i", WHO_AM_I, () =>
    run({ tool: "who_am_i", answer: () => tools.whoAmI(ctx) }),
  );
  server.registerTool("find_people", FIND_PEOPLE, (input) =>
    run({
      tool: "find_people",
      answer: () => tools.findPeople(ctx, input),
      countOf: (found) => found.people.length,
    }),
  );
  server.registerTool("my_leave_balance", MY_LEAVE_BALANCE, () =>
    run({ tool: "my_leave_balance", answer: () => tools.myLeaveBalance(ctx) }),
  );
  server.registerTool("preview_leave", PREVIEW_LEAVE, (input) =>
    run({ tool: "preview_leave", answer: () => tools.previewLeave(ctx, input) }),
  );
  server.registerTool("request_leave", REQUEST_LEAVE, (input) =>
    run({ tool: "request_leave", answer: () => tools.requestLeave(ctx, input) }),
  );
  server.registerTool("list_my_tasks", LIST_MY_TASKS, () =>
    run({
      tool: "list_my_tasks",
      answer: () => tools.listMyTasks(ctx, { origin: caller.origin }),
      countOf: (found) =>
        found.needsYou.length + found.waitingOnOthers.length + found.resolvedRecently.length,
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
      error instanceof ApplicationError
        ? refusalText(error)
        : "Broccoli could not answer; try again.";
    return { content: [{ type: "text" as const, text: message }], isError: true };
  }
}

/** A refusal's message with the fields and codes of invalid input, so the agent can explain it. */
function refusalText({ message, fieldErrors }: ApplicationError): string {
  const fields = fieldErrors.map(({ field, code }) => `${field}: ${code}`).join("; ");
  return fields ? `${message} ${fields}` : message;
}
