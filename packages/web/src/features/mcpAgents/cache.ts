import type { ApolloCache } from "@apollo/client";

/** Shows the person's agent as disconnected, with the connection that just ended as their last. */
export function showAgentDisconnected(cache: ApolloCache, ended: { id: string } | null): void {
  cache.modify({
    id: "ROOT_QUERY",
    fields: {
      myAgentConnection: () => null,
      myLastEndedAgentConnection: (last, { toReference }) =>
        ended ? (toReference({ __typename: "EndedAgentConnection", id: ended.id }) ?? last) : last,
    },
  });
}
