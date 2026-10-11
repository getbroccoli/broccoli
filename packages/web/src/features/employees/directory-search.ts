import { z } from "zod";

import type { EmployeeOrderField, EmployeesQueryVariables } from "@/__generated__/graphql";

const PAGE_SIZE = 50;
/** The longest search the API accepts. */
export const SEARCH_MAX_LENGTH = 100;

const ORDER_FIELDS = {
  name: "NAME",
  email: "EMAIL",
  startDate: "START_DATE",
} as const satisfies Record<string, EmployeeOrderField>;

const SORT_KEYS = ["name", "email", "startDate"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/**
 * The directory's search params. Each field falls back on its own, so a hand-edited
 * URL still opens a valid list.
 */
export const directorySearch = z.object({
  q: z.string().trim().min(1).max(SEARCH_MAX_LENGTH).optional().catch(undefined),
  sort: z.enum(SORT_KEYS).default("name").catch("name"),
  dir: z.enum(["asc", "desc"]).default("asc").catch("asc"),
  after: z.string().min(1).optional().catch(undefined),
});

export type DirectorySearch = z.infer<typeof directorySearch>;

/** The defaults, left out of the URL. */
export const DEFAULT_DIRECTORY_SEARCH = { sort: "name", dir: "asc" } as const;

export function toEmployeesVariables({ q, sort, dir, after }: DirectorySearch) {
  return {
    first: PAGE_SIZE,
    orderBy: { field: ORDER_FIELDS[sort], direction: dir === "asc" ? "ASC" : "DESC" },
    ...(after && { after }),
    ...(q && { filter: { search: q } }),
  } satisfies EmployeesQueryVariables;
}
