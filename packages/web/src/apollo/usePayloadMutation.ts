import type {
  ApolloCache,
  MutationUpdaterFunction,
  OperationVariables,
  TypedDocumentNode,
} from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { useCallback, useState } from "react";

import { payloadOf } from "./payloadOf";

/** A mutation's expected failure, as its payload's `error` reports it. */
export class PayloadFailure<PayloadError> extends Error {
  constructor(readonly payloadError: PayloadError) {
    super("The mutation returned an error.");
    this.name = "PayloadFailure";
  }
}

/**
 * Runs a mutation and reads its payload (RULE51 in docs/code-quality.md). The run function
 * resolves with the payload, and rejects with a `PayloadFailure` when the payload carries an
 * `error`, as it does on a top-level error, so a failure never passes as success.
 * `payloadError` keeps the last run's payload error for display; `error` is Apollo's
 * top-level one.
 */
export function usePayloadMutation<Data, Variables extends OperationVariables>(
  document: TypedDocumentNode<Data, Variables>,
  options?: { update?: MutationUpdaterFunction<Data, Variables, ApolloCache> },
) {
  const [mutate, { loading, error, reset: resetMutation }] = useMutation(document, options);
  const [payloadError, setPayloadError] = useState<PayloadErrorOf<Data> | null>(null);

  const run = useCallback(
    async (...args: Parameters<typeof mutate>) => {
      setPayloadError(null);
      const { data } = await mutate(...args);
      const outcome = payloadOf(data);
      if (outcome.error) {
        // The document's generated type describes the error `payloadOf` read from its data.
        const failure = outcome.error as unknown as PayloadErrorOf<Data>;
        setPayloadError(failure);
        throw new PayloadFailure(failure);
      }
      return outcome.payload as PayloadOf<Data>;
    },
    [mutate],
  );

  const reset = useCallback(() => {
    setPayloadError(null);
    resetMutation();
  }, [resetMutation]);

  return [run, { loading, error, payloadError, reset }] as const;
}

/** A mutation's payload: the value of its one operation in its one namespace. */
type PayloadOf<Data> = ValueOf<ValueOf<Data>>;
type ValueOf<T> = T[Exclude<keyof T, "__typename">];
/** The payload's selected `error`, when the mutation has one. */
type PayloadErrorOf<Data> =
  PayloadOf<Data> extends { error?: infer Error } ? NonNullable<Error> : never;
