import { GraphQLError, type GraphQLFormattedError } from "graphql";

import { ApplicationError } from "../applicationError";

/**
 * True for errors raised before execution: parse, validation and bad input. They
 * describe the request. Errors with a path come from execution and may carry internals,
 * even when graphql-js raised them (it puts unserializable values in the message).
 */
export function isRequestError(error: unknown): boolean {
  return (
    error instanceof GraphQLError &&
    error.path === undefined &&
    // Apollo reports a failing context function without a path, with the cause in its message.
    error.extensions.code !== "INTERNAL_SERVER_ERROR"
  );
}

/** The use case's expected failure behind a resolver error, if that is what it is. */
export function applicationErrorOf(error: unknown): ApplicationError | undefined {
  const cause = error instanceof GraphQLError ? error.originalError : undefined;
  return cause instanceof ApplicationError ? cause : undefined;
}

/**
 * A request error's message without the input value graphql-js quotes in it, since a
 * value may be a secret such as an API key. Other messages stay as they are.
 */
export function withoutInputValues(message: string): string {
  const variable = INVALID_VARIABLE.exec(message);
  if (variable) {
    return `Variable "$${variable[1]}" got an invalid value.`;
  }
  return INVALID_LITERAL.test(message) ? "An argument got an invalid value." : message;
}

/** graphql-js's coercion error for a variable: `Variable "$input" got invalid value {…}; …`. */
const INVALID_VARIABLE = /^Variable "\$(\w+)" got invalid value/;
/** Its validation errors for an inline value, such as `String cannot represent …: 5`. */
const INVALID_LITERAL = /cannot represent|Expected value of type/;

/**
 * Apollo `formatError`: passes request errors, without input values, and application
 * errors through and masks everything else.
 */
export function formatError(
  formatted: GraphQLFormattedError,
  error: unknown,
): GraphQLFormattedError {
  if (isRequestError(error)) {
    return { ...formatted, message: withoutInputValues(formatted.message) };
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
