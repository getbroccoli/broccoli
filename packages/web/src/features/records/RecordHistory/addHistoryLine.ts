import type { ApolloCache } from "@apollo/client";

import { RecordHistoryDocument, type RecordType } from "@/__generated__/graphql";

import { HISTORY_PAGE_SIZE, type HistoryLine } from "./historyLines";

/**
 * Puts a line a change just added at the top of a record's cached history, newest first, so a
 * save shows it without a refetch; a history not in the cache stays out of it.
 */
export function addHistoryLine(
  cache: ApolloCache,
  { recordType, recordId, line }: { recordType: RecordType; recordId: string; line: HistoryLine },
): void {
  cache.updateQuery(
    {
      query: RecordHistoryDocument,
      variables: { recordType, recordId, first: HISTORY_PAGE_SIZE },
    },
    (data) =>
      data && !data.recordHistory.edges.some(({ node }) => node.id === line.id)
        ? {
            recordHistory: {
              ...data.recordHistory,
              edges: [{ __typename: "RecordChangeEdge", node: line }, ...data.recordHistory.edges],
            },
          }
        : data,
  );
}
