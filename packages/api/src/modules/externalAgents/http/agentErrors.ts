import type express from "express";

import { ApplicationError } from "../../../core/applicationError";
import type { Logger } from "../../../core/logger";

/**
 * Answers an agent route's failure as `{ error: { code, fields? } }`, with Broccoli's own codes and
 * field names only, never an input value. Anything unexpected answers `INTERNAL` and is logged by
 * its kind alone: its message or stack, such as a failed query's, may hold a staff file's values.
 */
export function agentErrorHandler(logger: Logger): express.ErrorRequestHandler {
  // Express tells an error handler by its four parameters, so `next` stays though it is unused.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (error, request, response, next) => {
    if (sendExpectedError(error, response)) {
      return;
    }
    logger.error(
      { path: request.path, kind: (error as Error | undefined)?.constructor?.name },
      "An agent request failed",
    );
    response.status(500).json({ error: { code: "INTERNAL" } });
  };
}

/** Answers an expected failure or a body the parser would not read; whether it did. */
function sendExpectedError(error: unknown, response: express.Response): boolean {
  if (error instanceof ApplicationError) {
    response.status(HTTP_STATUS_OF[error.code]).json({
      error: {
        code: error.code,
        ...(error.fieldErrors.length > 0 && { fields: error.fieldErrors }),
      },
    });
    return true;
  }
  const bodyError = BODY_ERRORS[(error as { type?: string } | undefined)?.type ?? ""];
  if (bodyError) {
    response.status(bodyError.status).json({ error: { code: bodyError.code } });
    return true;
  }
  return false;
}

/** The answer to a request over its rate limit, in the same shape. */
export const tooManyRequests: express.RequestHandler = (_request, response) => {
  response.status(429).json({ error: { code: "TOO_MANY_REQUESTS" } });
};

const HTTP_STATUS_OF = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNAVAILABLE: 503,
} as const;

/** body-parser's error types for a body it would not read. */
const BODY_ERRORS: Record<string, { status: number; code: string }> = {
  "entity.too.large": { status: 413, code: "TOO_LARGE" },
  "entity.parse.failed": { status: 400, code: "INVALID_INPUT" },
  "encoding.unsupported": { status: 400, code: "INVALID_INPUT" },
};
