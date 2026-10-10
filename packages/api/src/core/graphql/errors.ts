import { GraphQLError, type GraphQLFormattedError } from "graphql";

import { ApplicationError } from "../application-error";

/**
 * True for errors raised before execution: parse, validation and bad input. They
 * describe the request. Errors with a path come from execution and may carry internals,
 * even when graphql-js raised them (it puts unserializable values in the message).
 */
export function isRequestError(error: unknown): boolean {
  return error instanceof GraphQLError && error.path === undefined;
}

/** The use case's expected failure behind a resolver error, if that is what it is. */
export function applicationErrorOf(error: unknown): ApplicationError | undefined {
  const cause = error instanceof GraphQLError ? error.originalError : undefined;
  return cause instanceof ApplicationError ? cause : undefined;
}

/**
 * Apollo `formatError`: passes request errors and application errors through and
 * masks everything else.
 */
export function formatError(
  formatted: GraphQLFormattedError,
  error: unknown,
): GraphQLFormattedError {
  if (isRequestError(error)) {
    return formatted;
  }
  const { locations, path } = formatted;
  const applicationError = applicationErrorOf(error);
  if (applicationError) {
    const { message, code, fieldErrors } = applicationError;
    return { message, locations, path, extensions: { code, fieldErrors } };
  }
  return {
    message: "Internal server error",
    locations,
    path,
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  };
}
