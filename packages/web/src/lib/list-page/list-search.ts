import type { DataTableSort } from "@/components/data-table";

/** The search params every paged list keeps in the URL. */
export interface ListSearch<SortKey extends string> {
  q?: string;
  sort: SortKey;
  dir: "asc" | "desc";
  after?: string;
}

export type ListAction<SortKey extends string> =
  | { type: "query"; q: string | undefined }
  | { type: "sort"; sort: DataTableSort<SortKey> }
  | { type: "next"; after: string }
  | { type: "first" }
  | { type: "resetCursor" };

export interface ListSearchChange<SortKey extends string> {
  patch: Partial<ListSearch<SortKey>>;
  /** True when the change replaces the current history entry instead of adding one. */
  replace: boolean;
}

/**
 * What a user action does to a list's URL. A new search or sort starts again from the
 * first page; typing and an invalid cursor replace history, so Back skips them.
 */
export function listSearchChange<SortKey extends string>(
  action: ListAction<SortKey>,
): ListSearchChange<SortKey> {
  switch (action.type) {
    case "query":
      return { patch: { q: action.q, after: undefined }, replace: true };
    case "sort":
      return {
        patch: { sort: action.sort.key, dir: action.sort.direction, after: undefined },
        replace: false,
      };
    case "next":
      return { patch: { after: action.after }, replace: false };
    case "first":
      return { patch: { after: undefined }, replace: false };
    case "resetCursor":
      return { patch: { after: undefined }, replace: true };
  }
}
