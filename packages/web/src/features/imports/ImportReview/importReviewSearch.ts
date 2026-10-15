import { z } from "zod";

import type { ImportEmployeeOrderField, ImportReviewQueryVariables } from "@/__generated__/graphql";

const PAGE_SIZE = 50;
/** The longest search the API accepts. */
export const SEARCH_MAX_LENGTH = 100;

const ORDER_FIELDS = {
  name: "NAME",
  email: "EMAIL",
  startDate: "START_DATE",
} as const satisfies Record<string, ImportEmployeeOrderField>;

const SORT_KEYS = ["name", "email", "startDate"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** The review's search params; each field falls back on its own, like the directory's. */
export const importReviewSearch = z.object({
  q: z.string().trim().min(1).max(SEARCH_MAX_LENGTH).optional().catch(undefined),
  sort: z.enum(SORT_KEYS).default("name").catch("name"),
  dir: z.enum(["asc", "desc"]).default("asc").catch("asc"),
  after: z.string().min(1).optional().catch(undefined),
});

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
