import { ErrorLink } from "@apollo/client/link/error";

import { applicationErrorOf } from "./application-error";

/**
 * Clears the cache when the API refuses a request for want of a session (signed out in
 * another tab, expired or revoked), then calls `onUnauthenticated`. The error still
 * reaches the caller.
 */
export function unauthenticatedLink(onUnauthenticated: () => void): ErrorLink {
  return new ErrorLink(({ error, operation }) => {
    if (applicationErrorOf(error)?.code === "UNAUTHENTICATED") {
      void operation.client.clearStore().then(onUnauthenticated);
    }
  });
}
