import type { GraphqlContext } from "./apollo";

/**
 * One lazy value per GraphQL request, such as a module's DataLoaders. Create each
 * accessor once and pass it to every resolver file; a second call is a separate slot.
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
