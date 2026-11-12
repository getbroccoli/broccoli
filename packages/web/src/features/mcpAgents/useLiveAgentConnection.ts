import { useApolloClient } from "@apollo/client/react";
import { useEffect } from "react";

/** The open queries that show the person's agent connection. */
const AGENT_CONNECTION_QUERIES = new Set(["YourAgent", "LeftNavAgentConnection"]);

/**
 * Keeps the person's agent connection current while they are signed in: the server nudges this
 * tab when their agent connects or a connection ends, and the open queries that show it read again.
 * After a dropped stream the browser reconnects by itself, and the queries read again then too.
 */
export function useLiveAgentConnection(): void {
  const apolloClient = useApolloClient();
  useEffect(() => {
    const refetch = () =>
      void apolloClient.refetchQueries({
        include: "active",
        onQueryUpdated: (query) => AGENT_CONNECTION_QUERIES.has(query.queryName ?? ""),
      });
    const stream = new EventSource("/api/live");
    let dropped = false;
    stream.onmessage = refetch;
    stream.onerror = () => {
      dropped = true;
    };
    stream.onopen = () => {
      if (dropped) refetch();
      dropped = false;
    };
    return () => stream.close();
  }, [apolloClient]);
}
