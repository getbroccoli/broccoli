import type { ImportReviewQuery } from "@/__generated__/graphql";
import type { DataTableColumn } from "@/components/dataTable";
import { t } from "@/i18n";
import { formatCalendarDate } from "@/lib/formatDate";

import { ImportPersonCell } from "./ImportPersonCell";
import type { SortKey } from "./importReviewSearch";
import { NotSet } from "./NotSet";
import { SourceIcon } from "./SourceIcon";

/** A row of the review: one import employee as its source proposes it. */
export type ImportReviewRow = ImportReviewQuery["import"]["employees"]["edges"][number]["node"];

export const IMPORT_REVIEW_COLUMNS: DataTableColumn<ImportReviewRow, SortKey>[] = [
  {
    id: "person",
    header: t("setup.review.column.person"),
    sortKey: "name",
    className: "w-48 min-w-48 max-w-48 md:w-[240px] md:min-w-[240px] md:max-w-[240px]",
    cell: (person) => <ImportPersonCell person={person} />,
  },
  {
    id: "email",
    header: t("setup.review.column.email"),
    sortKey: "email",
    className: "min-w-48 max-w-[280px] truncate",
    cell: ({ email, incompleteReason }) =>
      email ?? <NotSet missing={incompleteReason === "EMAIL"} />,
  },
  {
    id: "jobTitle",
    header: t("setup.review.column.jobTitle"),
    className: "min-w-40 max-w-[240px] truncate",
    cell: ({ jobTitle }) => jobTitle ?? <NotSet />,
  },
  {
    id: "startDate",
    header: t("setup.review.column.startDate"),
    sortKey: "startDate",
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
    className: "min-w-40 max-w-[220px]",
    cell: ({ source }) => (
      <span className="flex items-center gap-1.5 truncate text-muted-foreground">
        <SourceIcon kind={source.kind} />
        <span className="truncate">{source.name}</span>
      </span>
    ),
  },
];
