import express from "express";

import { createDecisions, type Decisions } from "../../src/core/ai/decisions";
import { createLogger } from "../../src/core/logger";
import { startSimpleHttpServer } from "./simpleHttpServer";

/** The real model for evals, reached through a local proxy that keeps every request. */
export interface LiveDecisions {
  decisions: Decisions;
  /** The values, of `forbidden`, that any request sent so far contains, ignoring case. */
  leaked(forbidden: readonly string[]): string[];
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
    sentBodies.push(body.toLowerCase());
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
    decisions: createDecisions({ url: server.url, apiKey, logger: createLogger("silent") }),
    leaked: (forbidden) =>
      forbidden.filter((value) => {
        // Bodies are JSON, so a value is searched for as JSON writes it.
        const written = JSON.stringify(value).slice(1, -1).toLowerCase();
        return sentBodies.some((body) => body.includes(written));
      }),
    cost: () => cost,
    stop: () => {
      upstreamCalls.abort();
      return server.stop();
    },
  };
}

const OPENROUTER_URL = "https://openrouter.ai/api";

function readCost(answer: string): number {
  try {
    const cost = (JSON.parse(answer) as { usage?: { cost?: unknown } }).usage?.cost;
    return typeof cost === "number" ? cost : 0;
  } catch {
    return 0;
  }
}
