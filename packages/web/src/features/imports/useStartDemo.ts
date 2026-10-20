import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";

import { StartDemoDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { startDemoSetup } from "@/features/setup";
import { useSessionChange } from "@/lib/useSessionChange";

/**
 * Leaves the import step with the demo company in place of the owner's people, then
 * routing sends the owner on. The browser holding self-hosted setup is signed in as the
 * demo's owner; a signed-in owner keeps their session, but the demo replaces every person
 * they had loaded, so the cache is cleared either way.
 */
export function useStartDemo() {
  const { holdsSetup } = useRouteContext({ from: "__root__" });
  const [startDemoMutation] = usePayloadMutation(StartDemoDocument);
  const [failed, setFailed] = useState(false);
  const [start, starting] = useSessionChange(async () => {
    setFailed(false);
    const started = holdsSetup
      ? await startDemoSetup()
      : await startDemoMutation().then(
          () => true,
          () => false,
        );
    setFailed(!started);
    return started;
  });

  return { start, starting, failed };
}
