import { ApplicationError, type ApplicationErrorCode, type FieldError } from "../applicationError";

/**
 * Returns the callback's payload fields, checked against the named generated resolver type.
 * Listed application errors become the payload's `error`; omit the codes for a payload
 * without `error`, and all other errors stay top-level.
 */
export async function mutationPayload<Payload>(
  // `NoInfer`: callers name the generated payload type rather than inferring it from `run`.
  run: () => Promise<PayloadResult<Awaited<NoInfer<Payload>>>>,
  expectedErrorCodes?: readonly PayloadErrorCode[],
): Promise<Awaited<Payload>> {
  if (!expectedErrorCodes) {
    return (await run()) as Awaited<Payload>;
  }
  try {
    return { ...(await run()), error: null } as Awaited<Payload>;
  } catch (error) {
    if (error instanceof ApplicationError && isListed(error.code, expectedErrorCodes)) {
      return { error: payloadErrorOf(error, error.code) } as Awaited<Payload>;
    }
    throw error;
  }
}

export type PayloadErrorCode = keyof PayloadErrors & ApplicationErrorCode;

/** A payload's fields other than its error. */
type PayloadResult<Payload> = Omit<Payload, "error" | "__typename">;

/**
 * The payload error of each `ApplicationError` code a mutation can return; `__typename`
 * resolves its GraphQL `Error` type.
 */
interface PayloadErrors {
  INVALID_INPUT: { __typename: "InvalidInputError"; message: string; fields: FieldError[] };
  CONFLICT: { __typename: "ConflictError"; message: string };
  NOT_FOUND: { __typename: "NotFoundError"; message: string };
  UNAVAILABLE: { __typename: "UnavailableError"; message: string };
}

function isListed(
  code: ApplicationErrorCode,
  expectedErrorCodes: readonly PayloadErrorCode[],
): code is PayloadErrorCode {
  return (expectedErrorCodes as readonly ApplicationErrorCode[]).includes(code);
}

function payloadErrorOf(
  { message, fieldErrors }: ApplicationError,
  code: PayloadErrorCode,
): PayloadErrors[PayloadErrorCode] {
  switch (code) {
    case "INVALID_INPUT":
      return { __typename: "InvalidInputError", message, fields: fieldErrors };
    case "CONFLICT":
      return { __typename: "ConflictError", message };
    case "NOT_FOUND":
      return { __typename: "NotFoundError", message };
    case "UNAVAILABLE":
      return { __typename: "UnavailableError", message };
  }
}
