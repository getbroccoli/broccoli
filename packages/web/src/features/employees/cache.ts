import type { ApolloCache } from "@apollo/client";

import { evictRecord } from "@/apollo";

/**
 * Drops a removed employee from the cache once their panel is gone: every cached list loses
 * their row and reopening them finds nobody. While the panel is open, evicting them would
 * refetch it.
 */
export function forgetEmployee(cache: ApolloCache, id: string): void {
  evictRecord(cache, "Employee", id);
}
