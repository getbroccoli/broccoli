import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";

import {
  ImportReviewColumns_ImportEmployeeFragmentDoc,
  type ImportReviewColumns_ImportEmployeeFragment,
} from "@/__generated__/graphql";
import type { DataTableColumn } from "@/components/dataTable";
import { t } from "@/i18n";
import { type SortKey } from "@/features/employees";
import { formatCalendarDate } from "@/lib/formatDate";

import { ImportPersonCell } from "./ImportPersonCell";
import { NotSet } from "./NotSet";
import { SourceIcon } from "./SourceIcon";

/** A row of the review: one import employee as its source proposes it. */
export type ImportReviewRow = ImportReviewColumns_ImportEmployeeFragment;

export const IMPORT_REVIEW_COLUMNS: DataTableColumn<ImportReviewRow, SortKey>[] = [
  {
    id: "person",
    header: t("setup.review.column.person"),
    sortKey: "name",
    className: "w-[28%] min-w-48 max-w-0",
    cell: (person) => <ImportPersonCell person={person} />,
  },
  {
    id: "email",
    header: t("setup.review.column.email"),
    sortKey: "email",
    className: "w-[26%] min-w-48 max-w-0 truncate",
    cell: ({ email, incompleteReason }) =>
      email ?? <NotSet missing={incompleteReason === "EMAIL"} />,
  },
  {
    id: "jobTitle",
    header: t("setup.review.column.jobTitle"),
    className: "w-[18%] min-w-36 max-w-0 truncate",
    cell: ({ jobTitle }) => jobTitle ?? <NotSet />,
  },
  {
    id: "startDate",
    header: t("setup.review.column.startDate"),
    sortKey: "startDate",
    className: "w-[13%] min-w-28",
    cell: ({ startDate }) =>
      startDate ? (
        <span className="text-foreground/80 tabular-nums">{formatCalendarDate(startDate)}</span>
      ) : (
        <NotSet />
      ),
  },
  {
    id: "source",
    header: t("setup.review.column.source"),
    className: "w-[15%] min-w-36 max-w-0",
    cell: ({ source }) => (
      <span className="flex items-center gap-1.5 truncate text-muted-foreground">
        <SourceIcon kind={source.kind} />
        <span className="truncate">{source.name}</span>
      </span>
    ),
  },
];

/**
 * Reads the table's fragment for the import employees a query returned. Undefined while
 * the first page loads, so the table shows its skeleton.
 */
export function useImportReviewRows(
  people: FragmentType<ImportReviewColumns_ImportEmployeeFragment>[] | undefined,
): ImportReviewRow[] | undefined {
  const { data, complete } = useFragment({
    fragment: ImportReviewColumns_ImportEmployeeFragmentDoc,
    // The document also holds the person cell's fragment it spreads.
    fragmentName: "ImportReviewColumns_importEmployee",
    from: people ?? [],
  });
  return people && complete ? data : undefined;
}
