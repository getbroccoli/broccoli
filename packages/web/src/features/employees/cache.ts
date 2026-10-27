import type { ApolloCache } from "@apollo/client";

import { type DeleteEmployeeMutation, EmployeePanelDocument } from "@/__generated__/graphql";
import { evictRecord } from "@/apollo";
import { addHistoryLine } from "@/features/records";

type ReportHistoryLine = NonNullable<
  DeleteEmployeeMutation["employee"]["delete"]["reportHistoryLines"]
>[number];

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

/** Adds the "manager removed" line to the cached history of each person a removed employee managed. */
export function addReportHistoryLines(
  cache: ApolloCache,
  lines: readonly ReportHistoryLine[],
): void {
  for (const line of lines) {
    if (line.record) {
      addHistoryLine(cache, { recordType: "EMPLOYEE", recordId: line.record.id, line });
    }
  }
}
