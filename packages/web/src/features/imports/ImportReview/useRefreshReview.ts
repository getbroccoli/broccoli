import { useApolloClient } from "@apollo/client/react";
import { useCallback } from "react";

import { ImportReviewDocument } from "@/__generated__/graphql";

/** Reloads the review after a choice: its rows, counts and checks all follow from it. */
export function useRefreshReview(): () => Promise<void> {
  const client = useApolloClient();
  return useCallback(async () => {
    await client.refetchQueries({ include: [ImportReviewDocument] });
  }, [client]);
}
