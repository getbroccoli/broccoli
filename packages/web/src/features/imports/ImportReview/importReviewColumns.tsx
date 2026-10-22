import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";

import {
  ImportReviewColumns_ImportEmployeeFragmentDoc,
  type ImportReviewColumns_ImportEmployeeFragment,
} from "@/__generated__/graphql";
import type { DataTableColumn } from "@/components/dataTable";
import { type SortKey } from "@/features/employees";
import { t } from "@/i18n";

import { EmployeeMenu } from "./EmployeeMenu";
import { employeeNameOf } from "./employeeFields";
import { EmployeeValueCell } from "./EmployeeValueCell";
import { ImportPersonCell } from "./ImportPersonCell";
import { LeftOutCell } from "./LeftOutCell";
import { SourceStack } from "./SourceStack";

/** A row of the review: one import employee, from one source or more. */
export type ImportReviewRow = ImportReviewColumns_ImportEmployeeFragment;

export const IMPORT_REVIEW_COLUMNS: DataTableColumn<ImportReviewRow, SortKey>[] = [
  {
    id: "person",
    header: t("setup.review.column.person"),
    sortKey: "name",
    className: "w-[28%] min-w-44 max-w-0",
    cell: (employee) => (
      <LeftOutCell leftOut={employee.leftOut}>
        <ImportPersonCell employee={employee} />
      </LeftOutCell>
    ),
  },
  {
    id: "email",
    header: t("setup.review.column.email"),
    sortKey: "email",
    className: "w-[24%] min-w-44 max-w-0",
    cell: (employee) => (
      <LeftOutCell leftOut={employee.leftOut}>
        <EmployeeValueCell
          employeeId={employee.id}
          employeeName={nameOf(employee)}
          field="email"
          value={employee.email}
          missing={employee.incompleteReason === "EMAIL"}
        />
      </LeftOutCell>
    ),
  },
  {
    id: "jobTitle",
    header: t("setup.review.column.jobTitle"),
    className: "w-[18%] min-w-36 max-w-0",
    cell: (employee) => (
      <LeftOutCell leftOut={employee.leftOut}>
        <EmployeeValueCell
          employeeId={employee.id}
          employeeName={nameOf(employee)}
          field="jobTitle"
          value={employee.jobTitle}
        />
      </LeftOutCell>
    ),
  },
  {
    id: "startDate",
    header: t("setup.review.column.startDate"),
    sortKey: "startDate",
    className: "w-[14%] min-w-32",
    cell: (employee) => (
      <LeftOutCell leftOut={employee.leftOut}>
        <EmployeeValueCell
          employeeId={employee.id}
          employeeName={nameOf(employee)}
          field="startDate"
          value={employee.startDate}
        />
      </LeftOutCell>
    ),
  },
  {
    id: "sources",
    header: t("setup.review.column.sources"),
    className: "w-[12%] min-w-28",
    cell: (employee) => (
      <LeftOutCell leftOut={employee.leftOut}>
        <SourceStack sources={sourcesOf(employee)} />
      </LeftOutCell>
    ),
  },
  {
    id: "menu",
    header: "",
    className: "w-12",
    cell: (employee) => (
      <EmployeeMenu
        employeeId={employee.id}
        employeeName={nameOf(employee)}
        leftOut={employee.leftOut}
      />
    ),
  },
];

/**
 * Reads the table's fragment for the import employees a query returned. Undefined while
 * the first page loads, so the table shows its skeleton.
 */
export function useImportReviewRows(
  employees: FragmentType<ImportReviewColumns_ImportEmployeeFragment>[] | undefined,
): ImportReviewRow[] | undefined {
  const { data, complete } = useFragment({
    fragment: ImportReviewColumns_ImportEmployeeFragmentDoc,
    // The document also holds the fragments of the cells it spreads.
    fragmentName: "ImportReviewColumns_importEmployee",
    from: employees ?? [],
  });
  return employees && complete ? data : undefined;
}

function nameOf({ firstName, lastName }: ImportReviewRow): string {
  return employeeNameOf(firstName.value, lastName.value);
}

/** The distinct sources of the import employee's records, in their order. */
function sourcesOf({ records }: ImportReviewRow) {
  return [...new Map(records.map(({ source }) => [source.id, source])).values()];
}
