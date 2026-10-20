import { useApolloClient } from "@apollo/client/react";
import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";

import { StartDemoDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { startDemoSetup } from "@/features/setup";
import { useRouteAction } from "@/lib/useRouteAction";

/**
 * Leaves the import step with the demo company in place of the owner's people; the router
 * then reloads and routing sends the owner on. The browser holding self-hosted setup is
 * signed in as the demo's owner, so the cache is cleared as on any sign-in.
 */
export function useStartDemo() {
  const apolloClient = useApolloClient();
  const { holdsSetup } = useRouteContext({ from: "__root__" });
  const [startDemoMutation] = usePayloadMutation(StartDemoDocument);
  const [run, starting] = useRouteAction();
  const [failed, setFailed] = useState(false);

  const start = () => {
    setFailed(false);
    run(async () => {
      const started = holdsSetup
        ? await startDemoSetup()
        : await startDemoMutation().then(
            () => true,
            () => false,
          );
      if (!started) {
        setFailed(true);
        return false;
      }
      if (holdsSetup) await apolloClient.clearStore();
    });
  };

  return { start, starting, failed };
}
