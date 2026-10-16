import type {
  ApolloCache,
  MutationUpdaterFunction,
  OperationVariables,
  TypedDocumentNode,
} from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { useCallback, useRef, useState } from "react";

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
  options?: { update?: MutationUpdaterFunction<Data, Variables, ApolloCache> } & NoFailureOptions,
) {
  const [mutate, { loading, error, reset: resetMutation }] = useMutation(document, options);
  const [payloadError, setPayloadError] = useState<PayloadErrorOf<Data> | null>(null);
  // Only the latest run, and none after `reset`, may show its payload error.
  const latestRun = useRef(0);

  const run = useCallback(
    async (...args: RunArgs<Parameters<typeof mutate>>) => {
      const thisRun = ++latestRun.current;
      setPayloadError(null);
      // Only options were removed, so the arguments still fit Apollo's generic signature.
      const { data } = await mutate(...(args as Parameters<typeof mutate>));
      const outcome = payloadOf(data);
      if (outcome.error) {
        // The document's generated type describes the error `payloadOf` read from its data.
        const failure = outcome.error as unknown as PayloadErrorOf<Data>;
        if (thisRun === latestRun.current) {
          setPayloadError(failure);
        }
        throw new PayloadFailure(failure);
      }
      return outcome.payload as PayloadOf<Data>;
    },
    [mutate],
  );

  const reset = useCallback(() => {
    latestRun.current++;
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
/** Apollo's run options without those that would treat a payload error as success. */
type RunArgs<Args extends unknown[]> = { [K in keyof Args]: WithoutFailureOptions<Args[K]> };
type WithoutFailureOptions<Options> = Options extends object
  ? Omit<Options, keyof NoFailureOptions> & NoFailureOptions
  : Options;
/** Forbidden even in an options variable, which `Omit` alone would let through. */
interface NoFailureOptions {
  onCompleted?: never;
  onError?: never;
  errorPolicy?: never;
}
