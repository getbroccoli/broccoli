import type {
  ApolloCache,
  DocumentNode,
  MutationUpdaterFunction,
  OperationVariables,
  TypedDocumentNode,
} from "@apollo/client";
import { useApolloClient, useMutation } from "@apollo/client/react";
import { useCallback, useRef, useState } from "react";

import { payloadOf } from "./payloadOf";

/** A mutation's expected failure; `payloadError` is the payload's `error` as selected. */
export class PayloadFailure<PayloadError> extends Error {
  constructor(readonly payloadError: PayloadError) {
    super("The mutation returned an error.");
    this.name = "PayloadFailure";
  }
}

/**
 * Runs a mutation and resolves with its payload (RULE51 in docs/code-quality.md), or rejects
 * with a `PayloadFailure` when the payload carries an `error`, as on a top-level error. Next to
 * Apollo's state, `payloadError` holds the latest run's payload error for display.
 */
export function usePayloadMutation<Data, Variables extends OperationVariables>(
  document: TypedDocumentNode<Data, Variables>,
  options?: {
    update?: MutationUpdaterFunction<Data, Variables, ApolloCache>;
    /** Active queries to refetch after a success; the run and `loading` end once they are back. */
    refetch?: DocumentNode[];
  },
) {
  const client = useApolloClient();
  const refetch = options?.refetch;
  // Only `update` reaches Apollo: its other options could treat a payload error as success.
  const [mutate, { reset: resetMutation, ...state }] = useMutation(document, {
    update: options?.update,
  });
  const [payloadError, setPayloadError] = useState<PayloadErrorOf<Data> | null>(null);
  const [refetching, setRefetching] = useState(false);
  // Only the latest run, and none after `reset`, may show its payload error.
  const latestRun = useRef(0);

  const run = useCallback(
    async (...[runOptions]: RunOptions<Variables>) => {
      const thisRun = ++latestRun.current;
      setPayloadError(null);
      // A fresh object, so only the variables reach Apollo, whatever else `runOptions` holds.
      // The cast bridges Apollo's generic tuple type, which `RunOptions` matches for variables.
      const apolloOptions = { variables: runOptions?.variables };
      const { data } = await mutate(...([apolloOptions] as Parameters<typeof mutate>));
      const { payload, error } = payloadOf(data);
      if (error) {
        // The document's generated type describes the error `payloadOf` read from its data.
        const failure = error as unknown as PayloadErrorOf<Data>;
        if (thisRun === latestRun.current) {
          setPayloadError(failure);
        }
        throw new PayloadFailure(failure);
      }
      if (refetch) {
        setRefetching(true);
        // The mutation succeeded; a failed refetch shows as its own query's error.
        await client.refetchQueries({ include: refetch }).catch(() => undefined);
        setRefetching(false);
      }
      return payload as PayloadOf<Data>;
    },
    [mutate, client, refetch],
  );

  const reset = useCallback(() => {
    latestRun.current++;
    setPayloadError(null);
    resetMutation();
  }, [resetMutation]);

  return [run, { ...state, loading: state.loading || refetching, payloadError, reset }] as const;
}

/** The variables; required when the mutation has a required one, which `Record<string, never>` lacks. */
type RunOptions<Variables> =
  Record<string, never> extends Variables
    ? [options?: { variables?: Variables }]
    : [options: { variables: Variables }];
/** A mutation's payload: the value of its root operation. */
type PayloadOf<Data> = ValueOf<Data>;
type ValueOf<T> = T[Exclude<keyof T, "__typename">];
/** The payload's selected `error`, when the mutation has one. */
type PayloadErrorOf<Data> =
  PayloadOf<Data> extends { error?: infer Error } ? NonNullable<Error> : never;
