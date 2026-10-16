import { ApplicationError, type ApplicationErrorCode, type FieldError } from "../applicationError";

/**
 * Runs a mutation's use case into its payload, named by its generated resolver type
 * (`ResolversTypes["CompanyUpdatePayload"]`) so `tsc` checks `field` and the result.
 * @param field The payload's field that holds the changed object.
 * @param run The use-case call; its result goes under `field`.
 * @param expectedErrorCodes The `ApplicationError` codes this mutation's payload reports as
 *   its `error`; omit them for a payload without `error`. Any other error is thrown, so
 *   refused callers and unexpected errors stay top-level.
 */
export async function mutationPayload<Payload>(
  // `NoInfer`: the payload type is always named, never guessed from `field`.
  field: NoInfer<ResultField<Awaited<Payload>>>,
  run: () => Promise<NonNullable<Awaited<NoInfer<Payload>>[ResultField<Awaited<Payload>>]>>,
  expectedErrorCodes?: readonly PayloadErrorCode[],
): Promise<Awaited<Payload>> {
  if (!expectedErrorCodes) {
    return { [field]: await run() } as Awaited<Payload>;
  }
  try {
    return { [field]: await run(), error: null } as Awaited<Payload>;
  } catch (error) {
    if (error instanceof ApplicationError && isListed(error.code, expectedErrorCodes)) {
      return { error: payloadErrorOf(error, error.code) } as Awaited<Payload>;
    }
    throw error;
  }
}

export type PayloadErrorCode = keyof PayloadErrors & ApplicationErrorCode;

/** The payload's field that holds the changed object. */
type ResultField<Payload> = Exclude<keyof Payload, "error" | "__typename">;

/**
 * The payload error of each `ApplicationError` code a mutation can return; `__typename`
 * resolves its GraphQL `Error` type.
 */
interface PayloadErrors {
  INVALID_INPUT: { __typename: "InvalidInputError"; message: string; fields: FieldError[] };
  CONFLICT: { __typename: "ConflictError"; message: string };
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
    case "UNAVAILABLE":
      return { __typename: "UnavailableError", message };
  }
}
