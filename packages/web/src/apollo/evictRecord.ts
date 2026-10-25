import type { ApolloCache } from "@apollo/client";

/**
 * Drops a deleted record from the cache: every cached connection reads without it, and objects
 * only it referenced go too.
 */
export function evictRecord(cache: ApolloCache, __typename: string, id: string): void {
  cache.evict({ id: cache.identify({ __typename, id }) });
  cache.gc();
}
