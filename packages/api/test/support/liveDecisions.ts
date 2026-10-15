import express from "express";

import { createDecisions, type Decisions } from "../../src/integrations/ai";
import { startSimpleHttpServer } from "./simpleHttpServer";

/** The real model for evals, reached through a local proxy that keeps every request. */
export interface LiveDecisions {
  decisions: Decisions;
  /** Forbidden values found as whole words in any request's keys or values, ignoring case. */
  leaked(forbidden: readonly string[]): string[];
  /** Every request sent so far, as the model received it. */
  requests(): unknown[];
  /** What the answers so far cost, in US dollars, as OpenRouter reports it. */
  cost(): number;
  stop(): Promise<void>;
}

/** Calls OpenRouter with the key in `EVAL_OPEN_ROUTER_KEY`; costs money. */
export async function startLiveDecisions(): Promise<LiveDecisions> {
  const apiKey = process.env.EVAL_OPEN_ROUTER_KEY;
  if (!apiKey) {
    throw new Error("Set EVAL_OPEN_ROUTER_KEY to run the evals");
  }
  const sentBodies: string[] = [];
  let cost = 0;
  // The client's timeout ends only its call to the proxy; stopping ends the calls to OpenRouter too.
  const upstreamCalls = new AbortController();
  const app = express().use(express.text({ type: "*/*", limit: "5mb" }));
  app.post("/alpha/decisions", async (request, response) => {
    const body = request.body as string;
    sentBodies.push(body);
    const upstream = await fetch(`${OPENROUTER_URL}/alpha/decisions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body,
      signal: upstreamCalls.signal,
    });
    const answer = await upstream.text();
    cost += readCost(answer);
    response.status(upstream.status).type("application/json").send(answer);
  });
  const server = await startSimpleHttpServer(app);
  return {
    decisions: createDecisions({ url: server.url, apiKey }),
    leaked: (forbidden) => {
      const texts = sentBodies.map((body) => stringsOf(JSON.parse(body)).join("\n"));
      return forbidden.filter((value) => {
        const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const word = new RegExp(
          `(?<![\\p{L}\\p{M}\\p{N}_])${escaped}(?![\\p{L}\\p{M}\\p{N}_])`,
          "iu",
        );
        return texts.some((text) => word.test(text));
      });
    },
    requests: () => sentBodies.map((body) => JSON.parse(body) as unknown),
    cost: () => cost,
    stop: () => {
      upstreamCalls.abort();
      return server.stop();
    },
  };
}

const OPENROUTER_URL = "https://openrouter.ai/api";

/** Every key and string value, so a value is matched as the model reads it, not as JSON escapes it. */
function stringsOf(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([key, item]) => [
    ...(Array.isArray(value) ? [] : [key]),
    ...stringsOf(item),
  ]);
}

function readCost(answer: string): number {
  try {
    const cost = (JSON.parse(answer) as { usage?: { cost?: unknown } }).usage?.cost;
    return typeof cost === "number" ? cost : 0;
  } catch {
    return 0;
  }
}
