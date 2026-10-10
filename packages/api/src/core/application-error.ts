export type ApplicationErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID_INPUT";

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
