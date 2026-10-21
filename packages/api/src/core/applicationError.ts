import type express from "express";

export type ApplicationErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  /** An external service, such as Slack, refused or failed. */
  | "UNAVAILABLE"
  /** The data is not in a state that allows this yet, such as a file still being read. */
  | "CONFLICT"
  /** Nothing the caller may see has this id. */
  | "NOT_FOUND";

/** Why one input field was refused, such as `{ field: "email", code: "taken" }`. */
export interface FieldError {
  field: string;
  code: string;
}

/**
 * An expected failure of a use case. Unlike other errors, it reaches the API client
 * with its code and field errors.
 */
export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly fieldErrors: FieldError[];

  constructor(code: ApplicationErrorCode, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

/** Refuses input with one field error per invalid field. */
export function invalidInput(fieldErrors: FieldError[]): ApplicationError {
  return new ApplicationError("INVALID_INPUT", "The input is invalid.", fieldErrors);
}

const HTTP_STATUS_OF = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  UNAVAILABLE: 503,
  CONFLICT: 409,
  NOT_FOUND: 404,
} as const;

/**
 * Answers an HTTP route's expected failure with its status, and invalid input with
 * its field errors; anything else is rethrown for Express's error handler.
 */
export function sendApplicationError(error: unknown, response: express.Response): void {
  if (!(error instanceof ApplicationError)) {
    throw error;
  }
  const status = HTTP_STATUS_OF[error.code];
  if (error.code === "INVALID_INPUT") {
    response.status(status).json({ code: error.code, fieldErrors: error.fieldErrors });
    return;
  }
  response.sendStatus(status);
}
