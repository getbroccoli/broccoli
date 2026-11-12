// eslint-disable-next-line no-restricted-imports -- A nudge refetches open queries, which the cache alone cannot.
import { useApolloClient } from "@apollo/client/react";
import { useEffect } from "react";

/** The open queries that show the person's agent connection. */
const AGENT_CONNECTION_QUERIES = new Set(["YourAgent", "LeftNavAgentConnection"]);

/**
 * Keeps the person's agent connection current while they are signed in: the server nudges this
 * tab when their agent connects or a connection ends, and the open queries that show it read again.
 * They read again each time the stream opens too, for a change made while it was not yet or no
 * longer open; the browser reopens a dropped stream by itself.
 */
export function useLiveAgentConnection(): void {
  const apolloClient = useApolloClient();
  useEffect(() => {
    const refetch = () =>
      void apolloClient.refetchQueries({
        include: "active",
        onQueryUpdated: (query) =>
          AGENT_CONNECTION_QUERIES.has(query.queryName ?? "") &&
          // A new read: one already in flight may have read the state before the change.
          apolloClient.query({
            query: query.query,
            variables: query.variables,
            fetchPolicy: "network-only",
            context: { queryDeduplication: false },
          }),
      });
    const stream = new EventSource("/api/live");
    stream.onmessage = refetch;
    stream.onopen = refetch;
    return () => stream.close();
  }, [apolloClient]);
}
