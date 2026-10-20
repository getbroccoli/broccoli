import { z } from "zod";

import type { KeysetQuery, KeysetRow } from "../../../../core/pagination";
import type { EmployeeOrder, EmployeeOrderField } from "../../../employees";
import type { ImportEmployee } from "../../domain";

type SortValue = string | boolean;

/** The sort values of an import employee in each order, the key last. */
export const IMPORT_EMPLOYEE_SORT_VALUES: Record<EmployeeOrderField, z.ZodType<SortValue[]>> = {
  NAME: z.tuple([z.string(), z.string(), z.string()]),
  EMAIL: z.tuple([z.boolean(), z.string(), z.string()]),
  START_DATE: z.tuple([z.boolean(), z.string(), z.string()]),
};

/** Import employees whose shown first name, last name or email contains `search`, ignoring case. */
export function matchesSearch({ values }: ImportEmployee, search: string): boolean {
  const needle = search.toLowerCase();
  return [values.firstName, values.lastName, values.email].some(({ value }) =>
    value?.toLowerCase().includes(needle),
  );
}

/** Up to `limit` import employees after `after`, in `order`, with their sort values. */
export function pageImportEmployees(
  employees: readonly ImportEmployee[],
  { order, after, limit }: KeysetQuery<EmployeeOrderField, SortValue[]>,
): KeysetRow<ImportEmployee, SortValue[]>[] {
  const keyed = employees.map((node) => ({ node, values: sortValues(node, order) }));
  const sorted = keyed.toSorted((a, b) => compare(a.values, b.values, order));
  const start =
    after === null ? 0 : sorted.findIndex(({ values }) => compare(values, after, order) > 0);
  return start === -1 ? [] : sorted.slice(start, start + limit);
}

/** What the list sorts by, the key last; a missing email or start date carries `true` to sort last. */
function sortValues({ key, values }: ImportEmployee, { field }: EmployeeOrder): SortValue[] {
  switch (field) {
    case "NAME":
      return [
        values.firstName.value?.toLowerCase() ?? "",
        values.lastName.value?.toLowerCase() ?? "",
        key,
      ];
    case "EMAIL":
      return [values.email.value === null, values.email.value ?? "", key];
    case "START_DATE":
      return [values.startDate.value === null, values.startDate.value ?? "", key];
  }
}

/** Compares sort values in `order`; a missing value stays last in either direction. */
function compare(a: SortValue[], b: SortValue[], { field, direction }: EmployeeOrder): number {
  const missingLast = field === "NAME" ? 0 : Number(a[0]) - Number(b[0]);
  if (missingLast !== 0) {
    return missingLast;
  }
  const sign = direction === "DESC" ? -1 : 1;
  for (let index = field === "NAME" ? 0 : 1; index < a.length; index++) {
    const difference = String(a[index]).localeCompare(String(b[index]));
    if (difference !== 0) {
      return sign * difference;
    }
  }
  return 0;
}
