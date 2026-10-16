import type {
  ApolloCache,
  MutationUpdaterFunction,
  OperationVariables,
  TypedDocumentNode,
} from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { useCallback } from "react";

import { payloadOf } from "./payloadOf";

/**
 * Runs a mutation and resolves with its payload (RULE51 in docs/code-quality.md). It rejects
 * when the payload carries an `error`, as on a top-level error, so a failure never passes as
 * success.
 */
export function usePayloadMutation<Data, Variables extends OperationVariables>(
  document: TypedDocumentNode<Data, Variables>,
  options?: { update?: MutationUpdaterFunction<Data, Variables, ApolloCache> },
) {
  // Only `update` reaches Apollo: its other options could treat a payload error as success.
  const [mutate, state] = useMutation(document, { update: options?.update });

  const run = useCallback(
    async (...[runOptions]: RunOptions<Variables>) => {
      // Apollo's tuple type for variables is generic; `RunOptions` mirrors it.
      const { data } = await mutate(...([runOptions] as Parameters<typeof mutate>));
      const { payload, error } = payloadOf(data);
      if (error) {
        throw new Error(error.message);
      }
      return payload as PayloadOf<Data>;
    },
    [mutate],
  );

  return [run, state] as const;
}

/** The variables, required when the mutation has any that are required. */
type RunOptions<Variables> = Record<string, never> extends Variables
  ? [options?: { variables?: Variables }]
  : [options: { variables: Variables }];
/** A mutation's payload: the value of its one operation in its one namespace. */
type PayloadOf<Data> = ValueOf<ValueOf<Data>>;
type ValueOf<T> = T[Exclude<keyof T, "__typename">];
