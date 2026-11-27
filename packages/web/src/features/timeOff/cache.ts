import type { ApolloCache } from "@apollo/client";

import { forgetWhosOut } from "@/features/employees";

/**
 * Drops a person's cached who's out, for every month read, and their figures, after their time
 * off changes, so a month or the type menu read later asks the API again.
 */
export function evictWhosOut(cache: ApolloCache, employeeId: string): void {
  cache.evict({
    id: cache.identify({ __typename: "Employee", id: employeeId }),
    fieldName: "timeOffTypes",
  });
  forgetWhosOut(cache, employeeId);
}
