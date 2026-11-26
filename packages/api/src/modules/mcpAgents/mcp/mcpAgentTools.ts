import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";

import type { AgentActivityOutcome, AgentActivityService } from "../../../core/agentAccess";
import { ApplicationError } from "../../../core/applicationError";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import type { McpAgentToolService } from "../app";
import {
  APPROVAL_CARD_URI,
  DECIDE_APPROVAL,
  FIND_PEOPLE,
  LIST_MY_TASKS,
  MCP_APP_MIME_TYPE,
  MY_LEAVE_BALANCE,
  PREVIEW_LEAVE,
  REQUEST_LEAVE,
  SHOW_APPROVAL,
  WHO_AM_I,
} from "./mcpAgentToolDefinitions";

export { MCP_AGENT_TOOLS } from "./mcpAgentToolDefinitions";

/** The person an agent's call acts for, which agent it is, and where it reached Broccoli. */
export interface AgentCaller {
  ctx: SecurityContext;
  clientId: string;
  origin: string;
}

/** The card a chat app shows for a task to decide; read once, shipped next to this file. */
const APPROVAL_CARD_HTML = readFileSync(new URL("./approvalCard.html", import.meta.url), "utf8");

/** Adds the tools to `server`, each acting as the person behind `caller` and recording its call. */
export function registerMcpAgentTools(
  server: McpServer,
  caller: AgentCaller,
  dependencies: { tools: McpAgentToolService; activity: AgentActivityService; logger: Logger },
): void {
  const { ctx } = caller;
  const { tools } = dependencies;
  const run: Run = (call) => resultOf(call, caller, dependencies);
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
  registerApprovalTools(server, { caller, tools, run });
}

/**
 * The approval card and its two tools: the model shows the card, and only the card decides, with
 * the one-time token Broccoli hands it beside the model's view.
 */
function registerApprovalTools(
  server: McpServer,
  { caller, tools, run }: { caller: AgentCaller; tools: McpAgentToolService; run: Run },
): void {
  const { ctx, origin } = caller;
  server.registerResource(
    "approval-card",
    APPROVAL_CARD_URI,
    { title: "Approval card", mimeType: MCP_APP_MIME_TYPE },
    () => ({
      contents: [{ uri: APPROVAL_CARD_URI, mimeType: MCP_APP_MIME_TYPE, text: APPROVAL_CARD_HTML }],
    }),
  );
  server.registerTool("show_approval", SHOW_APPROVAL, ({ taskId }) =>
    run({
      tool: "show_approval",
      answer: () => tools.showApproval(ctx, { taskId, origin }),
      split: ({ card, token, expiresAt }) => ({
        shown: card,
        meta: { "broccoli/cardToken": token, "broccoli/expiresAt": expiresAt },
      }),
    }),
  );
  server.registerTool("decide_approval", DECIDE_APPROVAL, (input) =>
    run({ tool: "decide_approval", answer: () => tools.decideApproval(ctx, input) }),
  );
}

/** One tool call: its answer, and how many records it returned for tools that count. */
interface ToolCall<T> {
  tool: string;
  answer: () => Promise<T>;
  countOf?: (value: T) => number;
  /** What the model reads, and what only the chat app's card gets in `_meta`. */
  split?: (value: T) => { shown: object; meta: Record<string, unknown> };
}

/** Runs one tool call as the caller. */
type Run = <T extends object>(call: ToolCall<T>) => ReturnType<typeof resultOf<T>>;

/**
 * The tool's answer; a refusal the person may read, or a failure that hides its cause. Records how
 * it ended as the person's agent activity.
 */
async function resultOf<T extends object>(
  { tool, answer, countOf, split }: ToolCall<T>,
  { ctx, clientId }: AgentCaller,
  { activity, logger }: { activity: AgentActivityService; logger: Logger },
) {
  const userId = ctx.user?.userId;
  const record = (outcome: AgentActivityOutcome, resultCount: number | null = null) =>
    activity.recordCall(ctx, { clientId, tool, outcome, resultCount });
  try {
    const value = await answer();
    await record("answered_by_broccoli", countOf ? countOf(value) : null);
    const { shown, meta } = split ? split(value) : { shown: value, meta: undefined };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(shown) }],
      structuredContent: shown as Record<string, unknown>,
      ...(meta ? { _meta: meta } : {}),
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
