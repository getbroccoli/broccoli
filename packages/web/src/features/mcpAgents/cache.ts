import type { ApolloCache } from "@apollo/client";

import { evictRecord } from "@/apollo";

/**
 * Shows the person's agent as disconnected: drops the connection they ended, and shows the
 * ending the server returned as their last.
 */
export function showAgentDisconnected(
  cache: ApolloCache,
  { connectionId, ended }: { connectionId: string; ended: { id: string } | null },
): void {
  cache.modify({
    id: "ROOT_QUERY",
    fields: {
      myAgentConnection: () => null,
      myLastEndedAgentConnection: (last, { toReference }) =>
        ended ? (toReference({ __typename: "EndedAgentConnection", id: ended.id }) ?? last) : last,
    },
  });
  evictRecord(cache, "AgentConnection", connectionId);
}
