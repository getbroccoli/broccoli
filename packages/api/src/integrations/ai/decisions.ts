import { z } from "zod";

import { withPlaceholders } from "./placeholders";

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

/** Per question, the answer, or null when its confidence is under the caller's minimum. */
export type Answers<Q extends Record<string, Question>> = { [Id in keyof Q]: Answer | null };

/**
 * Asks the model multiple-choice questions; the only way a request reaches it. Every
 * string in `state` leaves as a placeholder unless it cannot identify anyone; keys,
 * `instructions` and `options` are sent as they are and must never carry data.
 */
export interface Decisions {
  /**
   * Asks every question about `state` in one request; an answer under `minConfidence`
   * (default `DEFAULT_MIN_CONFIDENCE`) is null. Rejects with `DecisionsError`.
   */
  decide<Q extends Record<string, Question>>(
    state: JsonObject,
    questions: Q,
    minConfidence?: number,
  ): Promise<Answers<Q>>;
}

export const DECISIONS_MODEL = "typesafe/jev-1.13";

/** Only providers that neither keep nor train on requests; a request no such provider serves fails. */
const NO_RETENTION = { data_collection: "deny", zdr: true };

/** Under this, an answer is a guess and counts as no answer. */
const DEFAULT_MIN_CONFIDENCE = 0.8;

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
  timeoutMs = 30_000,
}: {
  url: string;
  apiKey: string;
  timeoutMs?: number;
}): Decisions {
  return {
    decide: async <Q extends Record<string, Question>>(
      state: JsonObject,
      questions: Q,
      minConfidence = DEFAULT_MIN_CONFIDENCE,
    ): Promise<Answers<Q>> => {
      const response = await post(`${url}/alpha/decisions`, apiKey, timeoutMs, {
        model: DECISIONS_MODEL,
        provider: NO_RETENTION,
        state: withPlaceholders(state),
        questions: Object.fromEntries(
          Object.entries(questions).map(([id, { instructions, options }]) => [
            id,
            { type: "choice", instructions, criteria: options },
          ]),
        ),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new DecisionsError(
          `The model answered ${response.status}`,
          RETRYABLE_STATUSES.has(response.status) || response.status >= 500,
        );
      }
      return readAnswers(parseJson(await readBody(response)), questions, minConfidence);
    },
  };
}

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

/** The body as text; a connection that breaks or times out mid-answer may succeed later. */
async function readBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    throw new DecisionsError(`The model's answer was cut off: ${String(error)}`, true);
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readAnswers<Q extends Record<string, Question>>(
  body: unknown,
  questions: Q,
  minConfidence: number,
): Answers<Q> {
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
      answer.confidence < minConfidence
        ? null
        : { choice: answer.choice, confidence: answer.confidence };
  }
  return answers as Answers<Q>;
}
