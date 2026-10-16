import { ApplicationError, type ApplicationErrorCode, type FieldError } from "../applicationError";

/**
 * The payload error of each `ApplicationError` code a mutation can return; `__typename`
 * resolves its GraphQL `Error` type.
 */
interface PayloadErrors {
  INVALID_INPUT: { __typename: "InvalidInputError"; message: string; fields: FieldError[] };
  CONFLICT: { __typename: "ConflictError"; message: string };
  UNAVAILABLE: { __typename: "UnavailableError"; message: string };
}

export type PayloadErrorCode = keyof PayloadErrors & ApplicationErrorCode;

/**
 * Runs a mutation's use case into its payload: the result under `field`. With `errorCodes`,
 * an `ApplicationError` with one of them becomes the payload's `error`; any other error is
 * thrown, so refused callers and unexpected errors stay top-level.
 */
export async function mutationPayload<Field extends string, T>(
  field: Field,
  run: () => Promise<T>,
): Promise<Record<Field, T>>;
export async function mutationPayload<Field extends string, T, Code extends PayloadErrorCode>(
  field: Field,
  run: () => Promise<T>,
  errorCodes: readonly Code[],
): Promise<Partial<Record<Field, T>> & { error: PayloadErrors[Code] | null }>;
export async function mutationPayload<Field extends string, T>(
  field: Field,
  run: () => Promise<T>,
  errorCodes?: readonly PayloadErrorCode[],
) {
  if (!errorCodes) {
    return { [field]: await run() };
  }
  try {
    return { [field]: await run(), error: null };
  } catch (error) {
    if (error instanceof ApplicationError && isListed(error.code, errorCodes)) {
      return { error: payloadErrorOf(error, error.code) };
    }
    throw error;
  }
}

function isListed(
  code: ApplicationErrorCode,
  errorCodes: readonly PayloadErrorCode[],
): code is PayloadErrorCode {
  return (errorCodes as readonly ApplicationErrorCode[]).includes(code);
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
    case "UNAVAILABLE":
      return { __typename: "UnavailableError", message };
  }
}
