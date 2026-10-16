import type {
  ApolloCache,
  MutationUpdaterFunction,
  OperationVariables,
  TypedDocumentNode,
} from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { useCallback } from "react";

import { payloadOf } from "./payloadOf";

/** A mutation's expected failure; `payloadError` is the payload's `error` as selected. */
export class PayloadFailure<PayloadError> extends Error {
  constructor(readonly payloadError: PayloadError) {
    super("The mutation returned an error.");
    this.name = "PayloadFailure";
  }
}

/**
 * Runs a mutation and resolves with its payload (RULE51 in docs/code-quality.md). It rejects
 * with a `PayloadFailure` when the payload carries an `error`, as on a top-level error, so a
 * failure never passes as success.
 */
export function usePayloadMutation<Data, Variables extends OperationVariables>(
  document: TypedDocumentNode<Data, Variables>,
  options?: { update?: MutationUpdaterFunction<Data, Variables, ApolloCache> },
) {
  // Only `update` reaches Apollo: its other options could treat a payload error as success.
  const [mutate, state] = useMutation(document, { update: options?.update });

  const run = useCallback(
    async (...[runOptions]: RunOptions<Variables>) => {
      // A fresh object, so only the variables reach Apollo, whatever else `runOptions` holds.
      // The cast bridges Apollo's generic tuple type, which `RunOptions` matches for variables.
      const apolloOptions = { variables: runOptions?.variables };
      const { data } = await mutate(...([apolloOptions] as Parameters<typeof mutate>));
      const { payload, error } = payloadOf(data);
      if (error) {
        // The document's generated type describes the error `payloadOf` read from its data.
        throw new PayloadFailure(error as unknown as PayloadErrorOf<Data>);
      }
      return payload as PayloadOf<Data>;
    },
    [mutate],
  );

  return [run, state] as const;
}

/** The variables; required when the mutation has a required one, which `Record<string, never>` lacks. */
type RunOptions<Variables> =
  Record<string, never> extends Variables
    ? [options?: { variables?: Variables }]
    : [options: { variables: Variables }];
/** A mutation's payload: the value of its one operation in its one namespace. */
type PayloadOf<Data> = ValueOf<ValueOf<Data>>;
type ValueOf<T> = T[Exclude<keyof T, "__typename">];
/** The payload's selected `error`, when the mutation has one. */
type PayloadErrorOf<Data> =
  PayloadOf<Data> extends { error?: infer Error } ? NonNullable<Error> : never;
