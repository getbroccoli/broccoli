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

/** The search params of a list of employees, such as the directory or the import review. */
export const employeeListSearch = listSearchSchema(SORT_KEYS);

export type EmployeeListSearch = z.infer<typeof employeeListSearch>;

/** The defaults, left out of the URL. */
export const DEFAULT_EMPLOYEE_LIST_SEARCH = { sort: "name", dir: "asc" } as const;

/** The variables of an employee list query: the same `first`, `after`, `orderBy` and `filter` everywhere. */
export function toEmployeeListVariables({ q, sort, dir, after }: EmployeeListSearch) {
  return {
    first: PAGE_SIZE,
    orderBy: { field: ORDER_FIELDS[sort], direction: dir === "asc" ? "ASC" : "DESC" },
    ...(after && { after }),
    ...(q && { filter: { search: q } }),
  } satisfies EmployeesQueryVariables;
}
