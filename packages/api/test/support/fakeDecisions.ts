import express from "express";

import { createDecisions, type Answer } from "../../src/core/ai/decisions";
import { createLogger } from "../../src/core/logger";
import { startSimpleHttpServer } from "./simpleHttpServer";

/** A local decisions provider with scripted choices; unspecified questions answer none. */
export async function startFakeDecisions() {
  let answers: Record<string, string | Answer>[] = [{}];
  let requestCount = 0;
  let status = 200;
  let nextAnswer: { received: () => void; released: Promise<void> } | undefined;
  const app = express().use(express.json());
  app.post("/alpha/decisions", async (request, response) => {
    requestCount++;
    if (status !== 200) {
      response.status(status).json({ error: "Decisions unavailable" });
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
      url: server.url,
      apiKey: "test-model-key",
      logger: createLogger("silent"),
    }),
    get requestCount() {
      return requestCount;
    },
    /** Answers each request in order, repeating the last script for later requests. */
    answer(next: Record<string, string | Answer>, ...following: Record<string, string | Answer>[]) {
      answers = [next, ...following];
      status = 200;
    },
    fail(nextStatus: number) {
      status = nextStatus;
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
