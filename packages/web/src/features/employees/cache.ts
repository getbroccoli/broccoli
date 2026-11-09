import type { ApolloCache } from "@apollo/client";

import {
  EmployeeNameFragmentDoc,
  EmployeePanelDocument,
  LocationNameFragmentDoc,
} from "@/__generated__/graphql";
import { evictRecord } from "@/apollo";
import { addHistoryLine } from "@/features/records";

/** A history line a change returned, with the employee it is about. */
type EmployeeHistoryLine = Parameters<typeof addHistoryLine>[1]["line"] & {
  record?: { id: string } | null;
};

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

/** Adds lines a change just wrote, such as "manager removed", to each employee's cached history. */
export function addEmployeeHistoryLines(
  cache: ApolloCache,
  lines: readonly EmployeeHistoryLine[],
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

/** The name of a location the cache holds, such as one the panel or the picker loaded. */
export function cachedLocationName(cache: ApolloCache, id: string): string | null {
  return (
    cache.readFragment({
      id: cache.identify({ __typename: "Location", id }),
      fragment: LocationNameFragmentDoc,
    })?.name ?? null
  );
}

/**
 * Drops every cached page of history, so each reads again when shown: a change that returns no
 * history line, such as a move to other terms, wrote one.
 */
export function forgetHistory(cache: ApolloCache): void {
  cache.evict({ id: "ROOT_QUERY", fieldName: "recordHistory" });
  cache.gc();
}
