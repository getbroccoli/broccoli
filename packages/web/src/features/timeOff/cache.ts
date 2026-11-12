import type { ApolloCache } from "@apollo/client";

/**
 * Drops a person's cached who's out, for every month read, and their figures, after their time
 * off changes, so a month or the type menu read later asks the API again.
 */
export function evictWhosOut(cache: ApolloCache, employeeId: string): void {
  const id = cache.identify({ __typename: "Employee", id: employeeId });
  cache.evict({ id, fieldName: "whosOut" });
  cache.evict({ id, fieldName: "timeOffTypes" });
  cache.gc();
}
