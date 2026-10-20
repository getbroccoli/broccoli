import { createHash } from "node:crypto";

import { z } from "zod";

import { AnswerTooLargeError, fetchJson, FetchStatusError, urlUnder } from "../../utils";
import { type CompletionInput, parseCompletionInput } from "./maskedEvidence";
import type { DecisionsSource } from "./resolvedDecisions";

/** The four PDF stages; each has one registered task. */
export type CompletionTaskId =
  "select_rows" | "qualify_layout" | "extract_references" | "assign_emails";

/** A stage's fixed request: its instructions and output schema, registered once at startup. */
export interface CompletionTask {
  instructions: string;
  /** Opens the evidence message. */
  evidenceHeading: string;
  /** Opens the drafts message; only a task that sends drafts has one. */
  draftsInstruction?: string;
  /** The JSON schema the provider must answer in, and the same as a parser. */
  schema: object;
  output: z.ZodType;
  reasoning: "low" | "none";
  maxTokens: number;
  timeoutMs: number;
}

/** Why a completion failed; `retryable` ones may succeed later unchanged. */
export type CompletionFailure =
  | "privacy_violation"
  | "too_large"
  | "unsupported"
  | "unauthorized"
  | "refused"
  | "transport"
  | "invalid_output";

export class CompletionError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly code: CompletionFailure,
    message: string,
  ) {
    super(message);
    this.name = "CompletionError";
    this.retryable = code === "transport" || code === "invalid_output";
  }
}

export interface CompletionResult {
  output: unknown;
  /** US dollars, as OpenRouter reports them; 0 when it does not. */
  cost: number;
  /** The SHA-256 of the request body that was sent, so an audit can match it to its proof. */
  requestSha256: string;
}

/**
 * Asks the model one registered task about masked evidence. Nothing leaves before the input passes
 * `parseCompletionInput`. A failure worth repeating is retried once with the recovery settings;
 * a second failure, or any other, rejects with `CompletionError`.
 */
export interface ReferenceCompletions {
  complete(task: CompletionTaskId, input: unknown, signal: AbortSignal): Promise<CompletionResult>;
}

export const COMPLETION_MODEL = "deepseek/deepseek-v4.1-flash-1017";

export function createReferenceCompletions({
  readSource,
  tasks,
}: {
  readSource: () => Promise<DecisionsSource>;
  tasks: Readonly<Record<CompletionTaskId, CompletionTask>>;
}): ReferenceCompletions {
  return {
    complete: async (taskId, rawInput, signal) => {
      const task = tasks[taskId];
      const input = parseCompletionInput(rawInput);
      const source = await readSource();
      if (source.kind !== "openrouter") {
        throw new CompletionError("unsupported", "Broccoli AI answers no completions");
      }
      const send = (policy: Policy) => sendRequest(source, task, input, policy, signal);
      try {
        return await send(PRIMARY);
      } catch (error) {
        if (!(error instanceof CompletionError) || !error.retryable) throw error;
        return send(RECOVERY);
      }
    },
  };
}

/** Where a request goes and how much it may think. */
interface Policy {
  provider: { order: string[]; allow_fallbacks: boolean };
  /** Overrides the task's reasoning and tokens; the recovery thinks less and answers shorter. */
  recovery: boolean;
}

/** The research's routing: one provider first, then another with fallbacks; all keep nothing. */
const PRIMARY: Policy = {
  provider: { order: ["inference-net"], allow_fallbacks: false },
  recovery: false,
};
const RECOVERY: Policy = {
  provider: { order: ["wafer", "inference-net"], allow_fallbacks: true },
  recovery: true,
};
const RECOVERY_MAX_TOKENS = 12_000;
const RECOVERY_TIMEOUT_MS = 45_000;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

async function sendRequest(
  source: Extract<DecisionsSource, { kind: "openrouter" }>,
  task: CompletionTask,
  input: CompletionInput,
  { provider, recovery }: Policy,
  signal: AbortSignal,
): Promise<CompletionResult> {
  const body = JSON.stringify({
    model: COMPLETION_MODEL,
    messages: messagesOf(task, input),
    temperature: 0,
    max_tokens: recovery ? RECOVERY_MAX_TOKENS : task.maxTokens,
    reasoning: !recovery && task.reasoning === "low" ? { effort: "low" } : { enabled: false },
    response_format: {
      type: "json_schema",
      json_schema: { name: "staff", strict: true, schema: task.schema },
    },
    provider: {
      data_collection: "deny",
      zdr: true,
      require_parameters: true,
      ...provider,
    },
  });
  if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
    throw new CompletionError("too_large", "The masked evidence is over the request limit");
  }
  const response = await post(
    source,
    body,
    recovery ? Math.min(task.timeoutMs, RECOVERY_TIMEOUT_MS) : task.timeoutMs,
    signal,
  );
  return {
    output: outputOf(response, task),
    cost: response.usage?.cost ?? 0,
    requestSha256: createHash("sha256").update(body).digest("hex"),
  };
}

function messagesOf(task: CompletionTask, { evidence, drafts }: CompletionInput) {
  return [
    { role: "system", content: task.instructions },
    {
      role: "user",
      content: [{ type: "text", text: task.evidenceHeading + JSON.stringify(evidence) }],
    },
    ...(drafts && task.draftsInstruction
      ? [{ role: "user", content: task.draftsInstruction + JSON.stringify(drafts) }]
      : []),
  ];
}

const responseSchema = z.object({
  error: z.unknown().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z.string().nullable().optional(),
          refusal: z.unknown().optional(),
        }),
      }),
    )
    .optional(),
  usage: z.object({ cost: z.number().optional() }).optional(),
});

type CompletionResponse = z.infer<typeof responseSchema>;

async function post(
  source: Extract<DecisionsSource, { kind: "openrouter" }>,
  body: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<CompletionResponse> {
  try {
    const response = await fetchJson(urlUnder(source.url, "v1/chat/completions"), responseSchema, {
      timeoutMs,
      maxBytes: MAX_RESPONSE_BYTES,
      signal,
      init: {
        method: "POST",
        headers: { authorization: `Bearer ${source.key}`, "content-type": "application/json" },
        body,
      },
    });
    if (response === null) throw new CompletionError("unsupported", "The model is not served");
    return response;
  } catch (error) {
    throw requestFailure(error, signal);
  }
}

/** The failure as a `CompletionError`, or the caller's own abort as it is. */
function requestFailure(error: unknown, signal: AbortSignal): unknown {
  if (signal.aborted || error instanceof CompletionError) return signal.reason ?? error;
  if (error instanceof AnswerTooLargeError) {
    return new CompletionError("too_large", "The model's answer is over the response limit");
  }
  if (error instanceof FetchStatusError) {
    if (error.status === 401 || error.status === 403) {
      return new CompletionError("unauthorized", `The model answered ${error.status}`);
    }
    const retryable = error.status === 408 || error.status === 429 || error.status >= 500;
    return new CompletionError(
      retryable ? "transport" : "refused",
      `The model answered ${error.status}`,
    );
  }
  // A dropped connection, a timeout, or a body that is not the expected JSON.
  return new CompletionError("transport", "The model could not be reached");
}

function outputOf(response: CompletionResponse, task: CompletionTask): unknown {
  const choice = response.choices?.[0];
  if (response.error !== undefined || !choice) {
    throw new CompletionError("transport", "The provider failed");
  }
  if (!choice.message.content) {
    if (choice.message.refusal) throw new CompletionError("refused", "The model refused");
    throw new CompletionError("invalid_output", "The model's answer is empty or cut off");
  }
  let json: unknown;
  try {
    json = JSON.parse(choice.message.content);
  } catch {
    throw new CompletionError("invalid_output", "The model's answer is not JSON");
  }
  const parsed = task.output.safeParse(json);
  if (!parsed.success) {
    throw new CompletionError("invalid_output", "The model's answer does not match its schema");
  }
  return parsed.data;
}
