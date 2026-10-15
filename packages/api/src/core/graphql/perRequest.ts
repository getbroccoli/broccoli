import type { GraphqlContext } from "./apollo";

/**
 * Lazily creates one value per GraphQL request, such as a module's DataLoaders.
 *
 * Each call returns its own accessor with its own slot, so a module may have several
 * (`loaders`, `slackCache`); the accessor is the name, typed and collision-free, so no
 * string keys are needed. Create each accessor once, where the module builds its
 * resolvers, and pass it to every resolver file that needs it: calling `perRequest`
 * again makes a second slot, and loaders split across slots stop batching together.
 * Request data that core knows up front, such as a trace id, belongs on
 * `GraphqlContext` instead.
 */
export function perRequest<T extends object>(
  create: (context: GraphqlContext) => T,
): (context: GraphqlContext) => T {
  const values = new WeakMap<GraphqlContext, T>();
  return (context) => {
    let value = values.get(context);
    if (!value) {
      value = create(context);
      values.set(context, value);
    }
    return value;
  };
}
