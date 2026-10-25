import type { ApolloCache } from "@apollo/client";

import { EmployeePanelDocument } from "@/__generated__/graphql";
import { evictRecord } from "@/apollo";

/**
 * Records the employee as absent before eviction, so an active panel query stays complete
 * without refetching. Every cached list loses their row and reopening them finds nobody.
 */
export function forgetEmployee(cache: ApolloCache, id: string): void {
  cache.batch({
    update(cache) {
      cache.writeQuery({
        query: EmployeePanelDocument,
        variables: { id },
        data: { employee: null },
      });
      evictRecord(cache, "Employee", id);
    },
  });
}
