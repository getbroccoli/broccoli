import type { ApolloServerPlugin } from "@apollo/server";
import { unwrapResolverError } from "@apollo/server/errors";

import type { Logger } from "../logger";
import type { GraphqlContext } from "./apollo";
import { applicationErrorOf, isRequestError, withoutInputValues } from "./errors";

/**
 * Logs unexpected errors with their cause, refusals at info with the caller's permission profile,
 * and other rejected requests only at debug level.
 */
export function errorLoggingPlugin(logger: Logger): ApolloServerPlugin<GraphqlContext> {
  return {
    requestDidStart: () =>
      Promise.resolve({
        didEncounterErrors: ({ errors, contextValue }) => {
          for (const error of errors) {
            if (isRequestError(error)) {
              logger.debug(
                { reason: withoutInputValues(error.message), code: error.extensions.code },
                "GraphQL request rejected",
              );
            } else if (applicationErrorOf(error)?.code === "FORBIDDEN") {
              logger.info(
                {
                  path: error.path,
                  reason: error.message,
                  permissionProfile: contextValue.security?.user?.permissionProfile ?? null,
                },
                "GraphQL request refused",
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
