import { unwrapResolverError } from "@apollo/server/errors";
import { GraphQLError, type GraphQLFormattedError } from "graphql";

/**
 * True for errors meant for the client: Apollo's request errors (parse, validation,
 * bad input) and `GraphQLError`s thrown on purpose. Anything else is a bug or an
 * infrastructure failure whose message may leak internals.
 */
export function isClientError(error: unknown): boolean {
  return unwrapResolverError(error) instanceof GraphQLError;
}

/** Apollo `formatError`: passes client errors through and masks everything else. */
export function formatError(
  formatted: GraphQLFormattedError,
  error: unknown,
): GraphQLFormattedError {
  if (isClientError(error)) {
    return formatted;
  }
  const { locations, path } = formatted;
  return {
    message: "Internal server error",
    locations,
    path,
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  };
}
