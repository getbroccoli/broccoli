import express from "express";

import { createDecisions, type Answer } from "../../src/core/ai/decisions";
import { createLogger } from "../../src/core/logger";
import { startSimpleHttpServer } from "./simpleHttpServer";

/** A local decisions provider with scripted choices; unspecified questions answer none. */
export async function startFakeDecisions() {
  let answers: Record<string, string | Answer> = {};
  let status = 200;
  const app = express().use(express.json());
  app.post("/alpha/decisions", (request, response) => {
    if (status !== 200) {
      response.status(status).json({ error: "Decisions unavailable" });
      return;
    }
    const { questions } = request.body as { questions: Record<string, unknown> };
    response.json({
      answers: Object.fromEntries(
        Object.keys(questions).map((id) => {
          const scripted = answers[id] ?? "none";
          const answer =
            typeof scripted === "string" ? { choice: scripted, confidence: 0.95 } : scripted;
          return [
            id,
            { type: "choice", ...answer, probabilities: { [answer.choice]: answer.confidence } },
          ];
        }),
      ),
    });
  });
  const server = await startSimpleHttpServer(app);
  return {
    ...server,
    decisions: createDecisions({
      url: server.url,
      apiKey: "test-model-key",
      logger: createLogger("silent"),
    }),
    answer(next: Record<string, string | Answer>) {
      answers = next;
      status = 200;
    },
    fail(nextStatus: number) {
      status = nextStatus;
    },
  };
}
