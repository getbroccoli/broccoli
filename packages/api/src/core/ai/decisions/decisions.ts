import { z } from "zod";

import type { Logger } from "../../logger";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

/** One multiple-choice question; `options` maps each option id to what it means. */
export interface Question {
  instructions: string;
  options: Record<string, string>;
}

export interface Answer {
  choice: string;
  confidence: number;
}

/** Per question, the answer, or null when the model is not confident enough. */
export type Answers<Q extends Record<string, Question>> = { [Id in keyof Q]: Answer | null };

/** Asks the model multiple-choice questions; the only way a request reaches it. */
export interface Decisions {
  /** Asks every question about `state` in one request. Rejects with `DecisionsError`. */
  decide<Q extends Record<string, Question>>(state: JsonObject, questions: Q): Promise<Answers<Q>>;
}

export const DECISIONS_MODEL = "typesafe/jev-1.13";

/** A failed request; a `retryable` one may succeed later unchanged. */
export class DecisionsError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "DecisionsError";
  }
}

export function createDecisions({
  url,
  apiKey,
  logger,
  timeoutMs = 30_000,
}: {
  url: string;
  apiKey: string;
  logger: Logger;
  timeoutMs?: number;
}): Decisions {
  return {
    decide: async <Q extends Record<string, Question>>(
      state: JsonObject,
      questions: Q,
    ): Promise<Answers<Q>> => {
      const startedAt = Date.now();
      const response = await post(`${url}/alpha/decisions`, apiKey, timeoutMs, {
        model: DECISIONS_MODEL,
        state,
        questions: Object.fromEntries(
          Object.entries(questions).map(([id, { instructions, options }]) => [
            id,
            { type: "choice", instructions, criteria: options },
          ]),
        ),
      });
      // Never the state: it holds the owner's data.
      logger.info(
        { status: response.status, questions: Object.keys(questions), ms: Date.now() - startedAt },
        "Asked the model",
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new DecisionsError(
          `The model answered ${response.status}`,
          RETRYABLE_STATUSES.has(response.status) || response.status >= 500,
        );
      }
      return readAnswers(await response.json().catch(() => null), questions);
    },
  };
}

/** Under this, an answer is a guess and counts as no answer. */
const MIN_CONFIDENCE = 0.8;

const RETRYABLE_STATUSES = new Set([408, 429]);

const responseSchema = z.object({
  answers: z.record(z.string(), z.object({ choice: z.string(), confidence: z.number() })),
});

async function post(
  url: string,
  apiKey: string,
  timeoutMs: number,
  body: unknown,
): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new DecisionsError(`The model could not be reached: ${String(error)}`, true);
  }
}

function readAnswers<Q extends Record<string, Question>>(body: unknown, questions: Q): Answers<Q> {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    throw new DecisionsError("The model's answer is unreadable", false);
  }
  const answers: Record<string, Answer | null> = {};
  for (const [id, { options }] of Object.entries(questions)) {
    const answer = parsed.data.answers[id];
    if (!answer || !Object.hasOwn(options, answer.choice)) {
      throw new DecisionsError(`The model gave no valid answer to "${id}"`, false);
    }
    answers[id] =
      answer.confidence < MIN_CONFIDENCE
        ? null
        : { choice: answer.choice, confidence: answer.confidence };
  }
  return answers as Answers<Q>;
}
