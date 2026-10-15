import type { z } from "zod";

import type { ImportEmployeeOrderField, ImportReviewQueryVariables } from "@/__generated__/graphql";
import { listSearchSchema } from "@/lib/listPage";

const PAGE_SIZE = 50;

const ORDER_FIELDS = {
  name: "NAME",
  email: "EMAIL",
  startDate: "START_DATE",
} as const satisfies Record<string, ImportEmployeeOrderField>;

const SORT_KEYS = ["name", "email", "startDate"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** The review's search params. */
export const importReviewSearch = listSearchSchema(SORT_KEYS);

export type ImportReviewSearch = z.infer<typeof importReviewSearch>;

/** The defaults, left out of the URL. */
export const DEFAULT_IMPORT_REVIEW_SEARCH = { sort: "name", dir: "asc" } as const;

export function toImportReviewVariables({ q, sort, dir, after }: ImportReviewSearch) {
  return {
    first: PAGE_SIZE,
    orderBy: { field: ORDER_FIELDS[sort], direction: dir === "asc" ? "ASC" : "DESC" },
    ...(after && { after }),
    ...(q && { filter: { search: q } }),
  } satisfies ImportReviewQueryVariables;
}
