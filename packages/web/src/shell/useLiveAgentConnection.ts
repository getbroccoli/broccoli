// eslint-disable-next-line no-restricted-imports -- A nudge refetches open queries, which the cache alone cannot.
import { useApolloClient } from "@apollo/client/react";
import { useEffect } from "react";

/** The open queries that show the person's agent connection and what their agent does. */
const AGENT_CONNECTION_QUERIES = new Set([
  "YourAgent",
  "YourAgentActivity",
  "LeftNavAgentConnection",
]);

/**
 * Keeps the person's agent connection current while they are signed in: the server nudges this
 * tab when their agent connects, a connection ends or the agent calls a tool, and the open
 * queries that show it read again.
 * They read again each time the stream opens too, for a change made while it was not yet or no
 * longer open; the browser reopens a dropped stream by itself.
 */
export function useLiveAgentConnection(): void {
  const apolloClient = useApolloClient();
  useEffect(() => {
    // One read at a time, so an older answer never lands after a newer one; nudges that arrive
    // meanwhile make one more read once it ends.
    let reading: Promise<unknown> | null = null;
    let readAgain = false;
    const readAll = () =>
      apolloClient.refetchQueries({
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
    const refetch = () => {
      if (reading) {
        readAgain = true;
        return;
      }
      reading = Promise.resolve(readAll()).finally(() => {
        reading = null;
        if (readAgain) {
          readAgain = false;
          refetch();
        }
      });
    };
    const stream = new EventSource("/api/live");
    stream.onmessage = refetch;
    stream.onopen = refetch;
    return () => stream.close();
  }, [apolloClient]);
}
