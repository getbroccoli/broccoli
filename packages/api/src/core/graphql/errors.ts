import { GraphQLError, type GraphQLFormattedError } from "graphql";

/**
 * True for errors raised before execution: parse, validation and bad input. They
 * describe the request. Errors with a path come from execution and may carry internals,
 * even when graphql-js raised them (it puts unserializable values in the message).
 */
export function isRequestError(error: unknown): boolean {
  return error instanceof GraphQLError && error.path === undefined;
}

/** Apollo `formatError`: passes request errors through and masks everything else. */
export function formatError(
  formatted: GraphQLFormattedError,
  error: unknown,
): GraphQLFormattedError {
  if (isRequestError(error)) {
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
