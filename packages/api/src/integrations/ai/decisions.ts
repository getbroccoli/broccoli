import { z } from "zod";

import { AnswerTooLargeError, readText } from "../../utils";
import { withPlaceholders } from "./sanitize";

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

/**
 * A failed request; a `retryable` one may succeed later unchanged. `providerMessage` is the
 * provider's own explanation, when it gave one, worded for the person who uploaded the file.
 */
export class DecisionsError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly providerMessage: string | null = null,
  ) {
    super(message);
    this.name = "DecisionsError";
  }
}

/** A failed request whose answer was 401, so a new credential may succeed. */
export class UnauthorizedDecisionsError extends DecisionsError {}

/** Decisions from `endpoint`, OpenRouter's decisions API or one that speaks it, as `credential`. */
export function createDecisions({
  endpoint,
  credential,
  headers = {},
  timeoutMs = 30_000,
}: {
  endpoint: string;
  credential: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): Decisions {
  return {
    decide: async <Q extends Record<string, Question>>(
      state: JsonObject,
      questions: Q,
      minConfidence = DEFAULT_MIN_CONFIDENCE,
    ): Promise<Answers<Q>> => {
      const response = await postJson(
        endpoint,
        { ...headers, authorization: `Bearer ${credential}` },
        timeoutMs,
        {
          model: DECISIONS_MODEL,
          provider: NO_RETENTION,
          state: withPlaceholders(state),
          questions: Object.fromEntries(
            Object.entries(questions).map(([id, { instructions, options }]) => [
              id,
              { type: "choice", instructions, criteria: options },
            ]),
          ),
        },
      );
      if (!response.ok) {
        throw await refusal(response);
      }
      return readAnswers(parseJson(await readBody(response)), questions, minConfidence);
    },
  };
}

const RETRYABLE_STATUSES = new Set([408, 429]);

/** A provider's refusal is a sentence; a longer body is read no further and its message dropped. */
const MAX_REFUSAL_BYTES = 4096;

/** Refusals that waiting cannot fix, though their status alone says "later". */
const FINAL_REASONS = new Set(["free_period_used"]);

const providerErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    metadata: z.object({ reason: z.string() }).partial().optional(),
  }),
});

const responseSchema = z.object({
  answers: z.record(z.string(), z.object({ choice: z.string(), confidence: z.number() })),
});

/** POSTs `body` as JSON, or nothing without one; a request that gets no answer may succeed later. */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  body?: unknown,
): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new DecisionsError(`The model could not be reached: ${String(error)}`, true);
  }
}

/** The error for an unsuccessful answer, with the provider's message when it sent one. */
export async function refusal(response: Response): Promise<DecisionsError> {
  const { status } = response;
  let body = "";
  try {
    body = await readText(response, MAX_REFUSAL_BYTES);
  } catch (error) {
    if (!(error instanceof AnswerTooLargeError)) {
      return new DecisionsError(`The model's answer was cut off: ${String(error)}`, true);
    }
  }
  const parsed = providerErrorSchema.safeParse(parseJson(body));
  const providerMessage = parsed.success ? parsed.data.error.message : null;
  const reason = parsed.success ? parsed.data.error.metadata?.reason : undefined;
  const message = `The model answered ${status}`;
  if (status === 401) {
    return new UnauthorizedDecisionsError(message, false, providerMessage);
  }
  const retryable =
    (RETRYABLE_STATUSES.has(status) || status >= 500) && !FINAL_REASONS.has(reason ?? "");
  return new DecisionsError(message, retryable, providerMessage);
}

/** The body as text; a connection that breaks or times out mid-answer may succeed later. */
export async function readBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    throw new DecisionsError(`The model's answer was cut off: ${String(error)}`, true);
  }
}

export function parseJson(text: string): unknown {
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
