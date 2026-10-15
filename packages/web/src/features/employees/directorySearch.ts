import type { z } from "zod";

import type { EmployeeOrderField, EmployeesQueryVariables } from "@/__generated__/graphql";
import { listSearchSchema } from "@/lib/listPage";

const PAGE_SIZE = 50;

const ORDER_FIELDS = {
  name: "NAME",
  email: "EMAIL",
  startDate: "START_DATE",
} as const satisfies Record<string, EmployeeOrderField>;

const SORT_KEYS = ["name", "email", "startDate"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** The directory's search params. */
export const directorySearch = listSearchSchema(SORT_KEYS);

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
