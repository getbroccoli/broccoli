import { randomBytes } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

import express from "express";

import {
  createDecisions,
  createReferenceCompletions,
  type Answer,
} from "../../src/integrations/ai";
import { PDF_COMPLETION_TASKS } from "../../src/modules/imports/pdfExtraction";
import { startSimpleHttpServer } from "./simpleHttpServer";

export interface FakeCompletionRequest {
  model: string;
  temperature: number;
  provider: {
    data_collection: string;
    zdr: boolean;
    require_parameters: boolean;
    order: string[];
    allow_fallbacks: boolean;
  };
  reasoning: { effort?: string; enabled?: boolean };
  max_tokens: number;
  response_format: {
    type: string;
    json_schema: { name: string; strict: boolean; schema: { required: string[] } };
  };
  messages: { role: string; content: string | { type: string; text?: string }[] }[];
}

type CompletionTask = "rows" | "hasEmployees" | "records" | "assignments";
type CompletionReply = {
  status?: number;
  content?: unknown;
  finishReason?: string;
  refusal?: string;
};
type CompletionScript = CompletionReply | ((request: FakeCompletionRequest) => unknown);

/** A local decisions provider with scripted choices; unspecified questions answer none. */
export async function startFakeDecisions() {
  let answers: Record<string, string | Answer>[] = [{}];
  const requests: unknown[] = [];
  const httpRequests: { path: string; headers: IncomingHttpHeaders; body: unknown }[] = [];
  const issuedTokens: string[] = [];
  const validTokens = new Set<string>();
  const acceptedKeys = new Set<string>();
  let tokenRefusal: { status: number; reason: string } | undefined;
  let status = 200;
  let failureMessage: string | undefined;
  let failureReason = "scripted_failure";
  let nextAnswer: { received: () => void; released: Promise<void> } | undefined;
  const completionRequests: FakeCompletionRequest[] = [];
  const completionScripts = new Map<CompletionTask, CompletionScript[]>();
  let nextCompletion: { received: () => void; released: Promise<void> } | undefined;
  const app = express().use(express.json({ limit: "2mb" }));
  app.use((request, _response, next) => {
    httpRequests.push({ path: request.path, headers: request.headers, body: request.body });
    next();
  });
  app.post("/v1/tokens", (_request, response) => {
    if (tokenRefusal) {
      const { status, reason } = tokenRefusal;
      tokenRefusal = undefined;
      response.status(status).json({
        error: { code: status, message: "Token refused.", metadata: { reason } },
      });
      return;
    }
    const token = randomBytes(32).toString("hex");
    issuedTokens.push(token);
    validTokens.add(token);
    response.status(201).json({ token, expires_at: "2099-01-01T00:00:00.000Z" });
  });
  app.get("/v1/key", (request, response) => {
    const key = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? "";
    if (acceptedKeys.has(key)) {
      response.json({ data: {} });
      return;
    }
    response.status(401).json({ error: { code: 401, message: "User not found." } });
  });
  app.post(["/alpha/decisions", "/v1/decisions"], async (request, response) => {
    requests.push(request.body);
    if (
      request.path === "/v1/decisions" &&
      !validTokens.has(request.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? "")
    ) {
      response.status(401).json({
        error: { code: 401, message: "Unknown token.", metadata: { reason: "unknown_token" } },
      });
      return;
    }
    if (status !== 200) {
      response.status(status).json({
        error:
          failureMessage === undefined
            ? "Decisions unavailable"
            : {
                code: status,
                message: failureMessage,
                metadata: { reason: failureReason },
              },
      });
      return;
    }
    const { questions } = request.body as { questions: Record<string, unknown> };
    const currentAnswers = answers.length > 1 ? answers.shift()! : answers[0]!;
    const body = {
      answers: Object.fromEntries(
        Object.keys(questions).map((id) => {
          const scripted = currentAnswers[id] ?? "none";
          const answer =
            typeof scripted === "string" ? { choice: scripted, confidence: 0.95 } : scripted;
          return [
            id,
            { type: "choice", ...answer, probabilities: { [answer.choice]: answer.confidence } },
          ];
        }),
      ),
    };
    const held = nextAnswer;
    nextAnswer = undefined;
    if (held) {
      held.received();
      await held.released;
    }
    response.json(body);
  });
  app.post("/v1/chat/completions", async (request, response) => {
    const body = request.body as FakeCompletionRequest;
    completionRequests.push(body);
    const task = body.response_format.json_schema.schema.required[0] as CompletionTask;
    const scripts = completionScripts.get(task);
    const script = scripts && (scripts.length > 1 ? scripts.shift()! : scripts[0]!);
    const reply = typeof script === "function" ? { content: script(body) } : script;
    const held = nextCompletion;
    nextCompletion = undefined;
    if (held) {
      held.received();
      await held.released;
    }
    if (!reply || (reply.status !== undefined && reply.status !== 200)) {
      response.status(reply?.status ?? 500).json({ error: "Scripted completion failure" });
      return;
    }
    response.json({
      choices: [
        {
          message: {
            role: "assistant",
            refusal: reply.refusal,
            content:
              typeof reply.content === "string" || reply.content === null
                ? reply.content
                : JSON.stringify(reply.content),
          },
          finish_reason: reply.finishReason ?? "stop",
        },
      ],
      usage: { cost: 0.001 },
    });
  });
  const server = await startSimpleHttpServer(app);
  return {
    ...server,
    decisions: createDecisions({
      endpoint: `${server.url}/alpha/decisions`,
      credential: "test-model-key",
    }),
    completions: createReferenceCompletions({
      readSource: () =>
        Promise.resolve({ kind: "openrouter", url: server.url, key: "test-model-key" }),
      tasks: PDF_COMPLETION_TASKS,
    }),
    completionRequests: () => completionRequests,
    /** Scripts one completion task, repeating its last reply for later requests. */
    answerCompletion(
      task: CompletionTask,
      first: CompletionScript,
      ...following: CompletionScript[]
    ) {
      completionScripts.set(task, [first, ...following]);
    },
    holdNextCompletion() {
      const received = Promise.withResolvers<void>();
      const released = Promise.withResolvers<void>();
      nextCompletion = { received: received.resolve, released: released.promise };
      return { received: received.promise, release: released.resolve };
    },
    get requestCount() {
      return requests.length;
    },
    requests: (): unknown[] => requests,
    httpRequests: () => httpRequests,
    issuedTokens: () => [...issuedTokens],
    forgetTokens: () => validTokens.clear(),
    acceptKey: (key: string) => {
      acceptedKeys.add(key);
    },
    refuseTokens(nextStatus: number, reason: string) {
      tokenRefusal = { status: nextStatus, reason };
    },
    /** Answers each request in order, repeating the last script for later requests. */
    answer(next: Record<string, string | Answer>, ...following: Record<string, string | Answer>[]) {
      answers = [next, ...following];
      status = 200;
    },
    fail(nextStatus: number, message?: string, reason = "scripted_failure") {
      status = nextStatus;
      failureMessage = message;
      failureReason = reason;
    },
    holdNextAnswer() {
      const received = Promise.withResolvers<void>();
      const released = Promise.withResolvers<void>();
      nextAnswer = { received: received.resolve, released: released.promise };
      return { received: received.promise, release: released.resolve };
    },
  };
}

export type FakeDecisions = Awaited<ReturnType<typeof startFakeDecisions>>;
