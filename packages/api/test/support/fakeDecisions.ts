import { randomBytes } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

import express from "express";

import { createDecisions, type Answer } from "../../src/integrations/ai";
import { startSimpleHttpServer } from "./simpleHttpServer";

/** A local decisions provider with scripted choices; unspecified questions answer none. */
export async function startFakeDecisions() {
  let answers: Record<string, string | Answer>[] = [{}];
  const requests: unknown[] = [];
  const httpRequests: { path: string; headers: IncomingHttpHeaders; body: unknown }[] = [];
  const issuedTokens: string[] = [];
  const validTokens = new Set<string>();
  let status = 200;
  let failureMessage: string | undefined;
  let nextAnswer: { received: () => void; released: Promise<void> } | undefined;
  const app = express().use(express.json());
  app.use((request, _response, next) => {
    httpRequests.push({ path: request.path, headers: request.headers, body: request.body });
    next();
  });
  app.post("/v1/tokens", (_request, response) => {
    const token = randomBytes(32).toString("hex");
    issuedTokens.push(token);
    validTokens.add(token);
    response.status(201).json({ token, expires_at: "2099-01-01T00:00:00.000Z" });
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
                metadata: { reason: "scripted_failure" },
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
  const server = await startSimpleHttpServer(app);
  return {
    ...server,
    decisions: createDecisions({
      endpoint: `${server.url}/alpha/decisions`,
      credential: "test-model-key",
    }),
    get requestCount() {
      return requests.length;
    },
    requests: (): unknown[] => requests,
    httpRequests: () => httpRequests,
    issuedTokens: () => [...issuedTokens],
    forgetTokens: () => validTokens.clear(),
    /** Answers each request in order, repeating the last script for later requests. */
    answer(next: Record<string, string | Answer>, ...following: Record<string, string | Answer>[]) {
      answers = [next, ...following];
      status = 200;
    },
    fail(nextStatus: number, message?: string) {
      status = nextStatus;
      failureMessage = message;
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
