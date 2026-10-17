import type { GraphqlContext, Resolvers } from "../../../core/graphql";
import { CHECK_KINDS, FIELDS, INCOMPLETE_REASONS } from "./graphqlValues";
import type { ImportLoaders } from "./loaders";

/** A kind of thing to settle in review, with the sources a conflict is between. */
export function importCheckResolvers(
  loaders: (context: GraphqlContext) => ImportLoaders,
): Resolvers["ImportCheck"] {
  return {
    kind: ({ kind }) => CHECK_KINDS[kind],
    field: (check) => (check.kind === "conflict" ? FIELDS[check.field] : null),
    reason: (check) => (check.kind === "incomplete" ? INCOMPLETE_REASONS[check.reason] : null),
    sources: (check, _args, context) =>
      check.kind === "conflict"
        ? Promise.all(check.sourceIds.map((id) => loaders(context).source.load(id)))
        : [],
  };
}
