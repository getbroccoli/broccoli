import type { GraphqlContext } from "./apollo";

/**
 * Lazily creates one value per GraphQL request, such as a module's DataLoaders. Create
 * the accessor once when building resolvers; requests never share its value.
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
