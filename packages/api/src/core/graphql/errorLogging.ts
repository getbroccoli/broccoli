import type { ApolloServerPlugin } from "@apollo/server";
import { unwrapResolverError } from "@apollo/server/errors";

import type { Logger } from "../logger";
import { applicationErrorOf, isRequestError, withoutInputValues } from "./errors";

/** Logs unexpected errors with their cause; rejected requests only at debug level. */
export function errorLoggingPlugin(logger: Logger): ApolloServerPlugin {
  return {
    requestDidStart: () =>
      Promise.resolve({
        didEncounterErrors: ({ errors }) => {
          for (const error of errors) {
            if (isRequestError(error)) {
              logger.debug(
                { reason: withoutInputValues(error.message), code: error.extensions.code },
                "GraphQL request rejected",
              );
            } else if (applicationErrorOf(error)) {
              logger.debug({ err: error, path: error.path }, "GraphQL request rejected");
            } else {
              logger.error(
                { err: unwrapResolverError(error), path: error.path },
                "GraphQL request failed",
              );
            }
          }
          return Promise.resolve();
        },
      }),
  };
}
