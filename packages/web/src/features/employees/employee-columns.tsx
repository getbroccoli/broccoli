import type { EmployeesQuery } from "@/__generated__/graphql";
import type { DataTableColumn } from "@/components/data-table";
import { t } from "@/i18n";
import { formatCalendarDate } from "@/lib/format-date";

import type { SortKey } from "./directory-search";
import { EmployeeNameCell } from "./EmployeeNameCell";

export type EmployeeRow = EmployeesQuery["employees"]["edges"][number]["node"];

export const EMPLOYEE_COLUMNS: DataTableColumn<EmployeeRow, SortKey>[] = [
  {
    id: "name",
    header: t("people.column.name"),
    sortKey: "name",
    className: "w-[220px] min-w-[220px] max-w-[220px]",
    cell: ({ firstName, lastName }) => (
      <EmployeeNameCell firstName={firstName} lastName={lastName} />
    ),
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
