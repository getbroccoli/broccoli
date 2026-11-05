import type { ApolloCache } from "@apollo/client";

import {
  TimeOffTypePanelDocument,
  type TimeOffTypePanel_TypeFragment,
} from "@/__generated__/graphql";
import { evictRecord } from "@/apollo";

/** Removes a deleted location from every cached list. */
export function forgetLocation(cache: ApolloCache, id: string): void {
  evictRecord(cache, "Location", id);
}

/** Puts a saved time off type into its open panel, new policies included, which no cached object holds. */
export function rememberTimeOffType(cache: ApolloCache, type: TimeOffTypePanel_TypeFragment): void {
  cache.updateQuery(
    { query: TimeOffTypePanelDocument, variables: { id: type.timeOffType.id } },
    // Spreading the cached settings keeps their typename, so the list's fields beside it survive.
    (data) => data && { timeOffSettings: { ...data.timeOffSettings, timeOffType: type } },
  );
}
