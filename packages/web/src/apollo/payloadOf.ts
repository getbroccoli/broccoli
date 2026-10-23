/** A mutation's payload and its error; `error` is `null` on success. */
export interface PayloadOutcome {
  payload: Record<string, unknown>;
  error: { __typename: string; message: string } | null;
}

/**
 * Reads a mutation's payload and its error from the result data. The operation may be
 * aliased; `__typename` is skipped.
 */
export function payloadOf(data: unknown): PayloadOutcome {
  const payload = onlyValue(data);
  if (!isObject(payload)) {
    throw new Error("The mutation returned no payload.");
  }
  const { error } = payload;
  return { payload, error: isObject(error) ? (error as PayloadOutcome["error"]) : null };
}

function onlyValue(data: unknown): unknown {
  if (!isObject(data)) {
    return undefined;
  }
  return Object.entries(data).find(([key]) => key !== "__typename")?.[1];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
