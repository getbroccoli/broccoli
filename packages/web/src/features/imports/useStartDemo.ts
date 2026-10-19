import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { StartDemoDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";

/**
 * Leaves the import step with the demo company in place of the owner's people; the router
 * then reloads and routing sends the owner on.
 */
export function useStartDemo() {
  const router = useRouter();
  const [startDemoMutation, { loading: starting }] = usePayloadMutation(StartDemoDocument);
  const [failed, setFailed] = useState(false);

  const start = async () => {
    setFailed(false);
    try {
      await startDemoMutation();
    } catch {
      setFailed(true);
      return;
    }
    await router.invalidate();
  };

  return { start, starting, failed };
}
