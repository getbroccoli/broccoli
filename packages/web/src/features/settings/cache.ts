import type { ApolloCache } from "@apollo/client";

import { evictRecord } from "@/apollo";

/** Removes a deleted location from every cached list. */
export function forgetLocation(cache: ApolloCache, id: string): void {
  evictRecord(cache, "Location", id);
}
