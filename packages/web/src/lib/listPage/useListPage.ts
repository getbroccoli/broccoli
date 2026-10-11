import { useCallback, useEffect } from "react";

import { applicationErrorOf } from "@/apollo";
import type { DataTablePager, DataTableSort } from "@/components/dataTable";

import { listSearchChange, type ListAction, type ListSearch } from "./listSearch";

/** The Relay connection fields a list page reads. */
export interface Connection<Node> {
  edges: { node: Node }[];
  pageInfo: { hasNextPage: boolean; endCursor?: string | null };
}

export interface ListPageInput<SortKey extends string, Node> {
  search: ListSearch<SortKey>;
  /** Writes the patch into the route's search params; the route keeps its typed navigate. */
  writeSearch: (patch: Partial<ListSearch<SortKey>>, replace: boolean) => void;
  /** The connection of the current query; undefined while it loads. */
  current: Connection<Node> | undefined;
  /** The connection of the previous query, shown while the current one loads. */
  previous: Connection<Node> | undefined;
  error: unknown;
}

export interface ListPage<SortKey extends string, Node> {
  rows: Node[] | undefined;
  sort: DataTableSort<SortKey>;
  changeQuery: (q: string | undefined) => void;
  changeSort: (sort: DataTableSort<SortKey>) => void;
  pager: DataTablePager | undefined;
  /** The query's error, except an invalid cursor, which goes back to the first page. */
  error: unknown;
}

/** Search, sort and cursor paging of a list whose state lives in the URL. */
export function useListPage<SortKey extends string, Node>({
  search,
  writeSearch,
  current,
  previous,
  error,
}: ListPageInput<SortKey, Node>): ListPage<SortKey, Node> {
  const apply = useCallback(
    (action: ListAction<SortKey>) => {
      const { patch, replace } = listSearchChange(action);
      writeSearch(patch, replace);
    },
    [writeSearch],
  );
  const hasInvalidCursor =
    Boolean(search.after) &&
    Boolean(applicationErrorOf(error)?.fieldErrors.some(({ field }) => field === "after"));

  useEffect(() => {
    if (hasInvalidCursor) apply({ type: "resetCursor" });
  }, [hasInvalidCursor, apply]);

  const changeQuery = useCallback((q: string | undefined) => apply({ type: "query", q }), [apply]);
  const changeSort = useCallback(
    (sort: DataTableSort<SortKey>) => apply({ type: "sort", sort }),
    [apply],
  );

  const shown = current ?? previous;
  // Only the current result continues the current search and sort.
  const endCursor = current?.pageInfo.endCursor;

  return {
    rows: shown?.edges.map(({ node }) => node),
    sort: { key: search.sort, direction: search.dir },
    changeQuery,
    changeSort,
    pager: shown && {
      hasNextPage: shown.pageInfo.hasNextPage,
      isFirstPage: !search.after,
      onNext: endCursor ? () => apply({ type: "next", after: endCursor }) : undefined,
      onFirst: () => apply({ type: "first" }),
    },
    error: hasInvalidCursor ? undefined : error,
  };
}
