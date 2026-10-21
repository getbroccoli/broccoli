import { z } from "zod";

import {
  DEFAULT_EMPLOYEE_LIST_SEARCH,
  employeeListSearch,
  toEmployeeListVariables,
} from "@/features/employees";

/** The review's search params: the employee list's, and the check the table is narrowed to. */
export const importReviewSearch = employeeListSearch.extend({
  check: z.string().trim().min(1).max(64).optional().catch(undefined),
});

/** The search params the review's URL leaves out: the employee list's defaults. */
export const DEFAULT_IMPORT_REVIEW_SEARCH = DEFAULT_EMPLOYEE_LIST_SEARCH;

export type ImportReviewSearch = z.infer<typeof importReviewSearch>;

/** The review query's variables: the employee list's, with the check in the filter. */
export function toImportReviewVariables({ check, ...search }: ImportReviewSearch) {
  const { filter, ...variables } = toEmployeeListVariables(search);
  return {
    ...variables,
    ...((filter || check) && { filter: { ...filter, ...(check && { check }) } }),
  };
}
