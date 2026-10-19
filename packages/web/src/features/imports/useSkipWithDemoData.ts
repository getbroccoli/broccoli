import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { SkipImportDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";

/**
 * Leaves the import step with the demo company in place of the owner's people; the router
 * then reloads and routing sends the owner on.
 */
export function useSkipWithDemoData() {
  const router = useRouter();
  const [skipImport, { loading: skipping }] = usePayloadMutation(SkipImportDocument);
  const [failed, setFailed] = useState(false);

  const skip = async () => {
    setFailed(false);
    try {
      await skipImport();
    } catch {
      setFailed(true);
      return;
    }
    await router.invalidate();
  };

  return { skip, skipping, failed };
}
