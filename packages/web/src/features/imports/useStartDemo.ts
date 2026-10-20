import { useApolloClient } from "@apollo/client/react";
import { useRouteContext, useRouter } from "@tanstack/react-router";
import { useState, useTransition } from "react";

import { StartDemoDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { startDemoSetup } from "@/features/setup";

/**
 * Leaves the import step with the demo company in place of the owner's people; the router
 * then reloads and routing sends the owner on. The browser holding self-hosted setup is
 * signed in as the demo's owner, so the cache is cleared as on any sign-in.
 */
export function useStartDemo() {
  const router = useRouter();
  const apolloClient = useApolloClient();
  const { holdsSetup } = useRouteContext({ from: "__root__" });
  const [startDemoMutation] = usePayloadMutation(StartDemoDocument);
  const [starting, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const start = () =>
    startTransition(async () => {
      setFailed(false);
      if (holdsSetup) {
        const started = await startDemoSetup();
        if (!started) {
          setFailed(true);
          return;
        }
        await apolloClient.clearStore();
      } else {
        try {
          await startDemoMutation();
        } catch {
          setFailed(true);
          return;
        }
      }
      await router.invalidate();
    });

  return { start, starting, failed };
}
