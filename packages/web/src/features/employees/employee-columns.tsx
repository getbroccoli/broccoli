import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";

import {
  EmployeeColumns_EmployeeFragmentDoc,
  type EmployeeColumns_EmployeeFragment,
} from "@/__generated__/graphql";
import type { DataTableColumn } from "@/components/data-table";
import { t } from "@/i18n";
import { formatCalendarDate } from "@/lib/format-date";

import type { SortKey } from "./directory-search";
import { EmployeeNameCell } from "./EmployeeNameCell";

/** A row of the employee table: the fields of the `EmployeeColumns_employee` fragment. */
export type EmployeeRow = EmployeeColumns_EmployeeFragment;

export const EMPLOYEE_COLUMNS: DataTableColumn<EmployeeRow, SortKey>[] = [
  {
    id: "name",
    header: t("people.column.name"),
    sortKey: "name",
    className: "w-[220px] min-w-[220px] max-w-[220px]",
    cell: (employee) => <EmployeeNameCell employee={employee} />,
  },
  {
    id: "email",
    header: t("people.column.email"),
    sortKey: "email",
    className: "max-w-[280px]",
    cell: ({ email }) => (
      <a
        href={`mailto:${email}`}
        className="block truncate text-muted-foreground hover:text-foreground hover:underline"
      >
        {email}
      </a>
    ),
  },
  {
    id: "jobTitle",
    header: t("people.column.jobTitle"),
    className: "max-w-[240px] truncate",
    cell: ({ jobTitle }) => jobTitle,
  },
  {
    id: "startDate",
    header: t("people.column.startDate"),
    sortKey: "startDate",
    cell: ({ startDate }) =>
      startDate ? (
        <span className="text-foreground/80 tabular-nums">{formatCalendarDate(startDate)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

/**
 * Reads the table's fragment for the employees a query returned. Undefined while the
 * first page loads, so the table shows its skeleton.
 */
export function useEmployeeRows(
  employees: FragmentType<EmployeeColumns_EmployeeFragment>[] | undefined,
): EmployeeRow[] | undefined {
  const { data, complete } = useFragment({
    fragment: EmployeeColumns_EmployeeFragmentDoc,
    // The document also holds the name cell's fragment it spreads.
    fragmentName: "EmployeeColumns_employee",
    from: employees ?? [],
  });
  return employees && complete ? data : undefined;
}
