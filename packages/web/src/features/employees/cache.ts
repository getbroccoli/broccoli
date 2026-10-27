import type { ApolloCache } from "@apollo/client";

import {
  type DeleteEmployeeMutation,
  EmployeeNameFragmentDoc,
  EmployeePanelDocument,
} from "@/__generated__/graphql";
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

/** The name of an employee the cache holds, such as a manager the panel or the picker loaded. */
export function cachedEmployeeName(cache: ApolloCache, id: string): string | null {
  const employee = cache.readFragment({
    id: cache.identify({ __typename: "Employee", id }),
    fragment: EmployeeNameFragmentDoc,
  });
  return employee && `${employee.firstName} ${employee.lastName}`;
}
