import type { ApolloCache } from "@apollo/client";

/** Removing Slack disconnected it: the cached connection goes with the source. */
export function forgetSlackConnection(cache: ApolloCache): void {
  cache.modify({ fields: { slackConnection: () => null } });
}
