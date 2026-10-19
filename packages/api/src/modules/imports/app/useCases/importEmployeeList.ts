import { z } from "zod";

import type { EmployeeOrder } from "../../../employees";
import { type ImportEmployee, nameSortKey } from "../../domain";

/** The sort values of the last import employee seen, behind the order they belong to. */
export type ImportEmployeeKeyset = [field: string, direction: string, ...values: SortValue[]];

type SortValue = string | boolean;

/** Parses the keyset of a cursor; a cursor from another order does not match. */
export function importEmployeeKeyset({
  field,
  direction,
}: EmployeeOrder): z.ZodType<ImportEmployeeKeyset> {
  return z.tuple([z.literal(field), z.literal(direction), ...KEYSET_VALUES[field]]);
}

/** Import employees whose shown first name, last name or email contains `search`, ignoring case. */
export function matchesSearch({ values }: ImportEmployee, search: string): boolean {
  const needle = search.toLowerCase();
  return [values.firstName, values.lastName, values.email].some(({ value }) =>
    value?.toLowerCase().includes(needle),
  );
}

/** Up to `first + 1` import employees after `after`, in `order`, with their keysets. */
export function pageImportEmployees(
  employees: readonly ImportEmployee[],
  order: EmployeeOrder,
  { first, after }: { first: number; after: ImportEmployeeKeyset | null },
): { node: ImportEmployee; keyset: ImportEmployeeKeyset }[] {
  const keyed = employees.map((node) => ({ node, values: sortValues(node, order) }));
  const sorted = keyed.toSorted((a, b) => compare(a.values, b.values, order));
  const start =
    after === null
      ? 0
      : sorted.findIndex(({ values }) => compare(values, after.slice(2), order) > 0);
  return (start === -1 ? [] : sorted.slice(start, start + first + 1)).map(({ node, values }) => ({
    node,
    keyset: [order.field, order.direction, ...values],
  }));
}

const KEYSET_VALUES = {
  NAME: [z.string(), z.string(), z.string()],
  EMAIL: [z.boolean(), z.string(), z.string()],
  START_DATE: [z.boolean(), z.string(), z.string()],
} as const;

/** What the list sorts by, the key last; a missing email or start date carries `true` to sort last. */
function sortValues({ key, values }: ImportEmployee, { field }: EmployeeOrder): SortValue[] {
  switch (field) {
    case "NAME":
      return nameSortKey(values.firstName.value, values.lastName.value, key);
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
