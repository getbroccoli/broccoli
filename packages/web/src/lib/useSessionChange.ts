// eslint-disable-next-line no-restricted-imports -- Session changes need clearStore(), not just the cache.
import { useApolloClient } from "@apollo/client/react";

import { useRouteAction } from "./useRouteAction";

/**
 * Runs an action that changes who is signed in, such as signing in or starting the demo.
 * When it returns true, the cache is cleared and the route reloads, and `pending` lasts
 * until the next page renders; one that returns false or throws stops there, leaving its
 * error to the caller.
 */
export function useSessionChange<Args extends unknown[]>(
  action: (...args: Args) => Promise<boolean>,
) {
  const apolloClient = useApolloClient();
  const [run, pending] = useRouteAction();

  const change = (...args: Args) =>
    run(async () => {
      if (!(await action(...args))) return false;
      await apolloClient.clearStore();
    });

  return [change, pending] as const;
}
