import type { ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { type DataTableDensity, SortableHeader, type DataTableSort } from "./SortableHeader";
import { TablePager, type DataTablePager } from "./TablePager";
import { TableSkeleton } from "./TableStates";

// The first column stays put while the rows scroll sideways; in a compact list the inset shadow marks its edge.
const PINNED_COLUMN = "sticky left-0 z-10 bg-card";
const PINNED_EDGE = "shadow-[inset_-1px_0_0_var(--color-border)]";
const INTERACTIVE = "a, button, input, select, textarea, [role=button], [role=checkbox]";

export interface DataTableColumn<Row, SortKey extends string = string> {
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Set to make the column sortable by this key. */
  sortKey?: SortKey;
  className?: string;
}

/** Rows people can pick with checkboxes, such as to act on several at once. */
export interface DataTableSelection<Row> {
  selectedIds: ReadonlySet<string>;
  onChange: (selectedIds: ReadonlySet<string>) => void;
  /** Rows without a checkbox, such as people who cannot be invited. */
  isSelectable?: (row: Row) => boolean;
  /** Names a row for its checkbox, such as a person's name. */
  rowLabel: (row: Row) => string;
}

interface DataTableProps<Row, SortKey extends string> {
  columns: DataTableColumn<Row, SortKey>[];
  /** Undefined while the first page loads. */
  rows: Row[] | undefined;
  getRowId: (row: Row) => string;
  sort: DataTableSort<SortKey>;
  onSortChange: (sort: DataTableSort<SortKey>) => void;
  /** Shown when there are no rows. */
  emptyState: ReactNode;
  /** Shown instead of the rows, such as an error. */
  notice?: ReactNode;
  /** True while rows load; rows already shown stay, dimmed. */
  isLoading?: boolean;
  /** The left side of the toolbar. */
  toolbar?: ReactNode;
  pager?: DataTablePager;
  /** Shown at the left of the footer, such as how many rows there are. */
  summary?: ReactNode;
  density?: DataTableDensity;
  /** Opens a row on a click anywhere in it; keyboard users reach the same through a link in the row. */
  onRowClick?: (row: Row) => void;
  /** Checkboxes in the first column. */
  selection?: DataTableSelection<Row>;
  /** Replaces the toolbar while any row is selected. */
  bulkBar?: ReactNode;
}

/**
 * The shared table for content lists: a framed card with a toolbar, a header row and
 * the first column that stay pinned while the rows scroll, and a pager.
 */
export function DataTable<Row, SortKey extends string>({
  columns,
  rows,
  getRowId,
  sort,
  onSortChange,
  emptyState,
  notice,
  isLoading = false,
  toolbar,
  pager,
  summary,
  density = "compact",
  onRowClick,
  selection,
  bulkBar,
}: DataTableProps<Row, SortKey>) {
  const placeholder = notice ?? (rows?.length === 0 ? emptyState : undefined);
  const comfortable = density === "comfortable";
  // The pager shows only when there is another page to move to.
  const showPager = pager && !notice && (pager.hasNextPage || !pager.isFirstPage);
  const selecting = selection && selection.selectedIds.size > 0;
  const selectable =
    selection && rows ? rows.filter((row) => selection.isSelectable?.(row) ?? true) : [];
  const pageSelected =
    selectable.length > 0 && selectable.every((row) => selection!.selectedIds.has(getRowId(row)));
  const toggle = (ids: string[], checked: boolean) => {
    const next = new Set(selection!.selectedIds);
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    selection!.onChange(next);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {selecting && bulkBar ? (
        <div className="flex min-h-[53px] items-center gap-3 border-b border-border/60 bg-row-selected px-3 py-2.5">
          {bulkBar}
        </div>
      ) : (
        toolbar && (
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5">
            {toolbar}
          </div>
        )
      )}
      <div className="subtle-scrollbar max-h-[70vh] overflow-auto">
        <table
          aria-busy={isLoading}
          className={cn("w-full", comfortable ? "text-sm" : "text-[12.5px]")}
        >
          <TableHeader
            className={cn(
              "sticky top-0 z-20 [&_tr]:border-border/60",
              comfortable ? "bg-app-backdrop [&_th]:bg-app-backdrop" : "bg-card",
            )}
          >
            <TableRow className="hover:bg-transparent">
              {columns.map((column, index) => (
                <SortableHeader
                  key={column.id}
                  leading={
                    index === 0 &&
                    selection && (
                      <Checkbox
                        aria-label={t("table.selectPage")}
                        checked={pageSelected}
                        indeterminate={
                          !pageSelected &&
                          selectable.some((row) => selection.selectedIds.has(getRowId(row)))
                        }
                        disabled={selectable.length === 0}
                        onCheckedChange={(checked) => toggle(selectable.map(getRowId), checked)}
                      />
                    )
                  }
                  label={column.header}
                  sortKey={column.sortKey}
                  sort={sort}
                  onSortChange={onSortChange}
                  density={density}
                  className={cn(
                    index === 0 && PINNED_COLUMN,
                    index === 0 && !comfortable && PINNED_EDGE,
                    column.className,
                  )}
                />
              ))}
            </TableRow>
          </TableHeader>
          {rows && !placeholder && (
            <TableBody className={cn("transition-opacity", isLoading && "opacity-60")}>
              {rows.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  onClick={
                    onRowClick &&
                    ((event) => {
                      // A link or control in the row does its own thing, as do modified clicks.
                      const target = event.target as HTMLElement;
                      if (
                        target.closest(INTERACTIVE) ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey
                      )
                        return;
                      onRowClick(row);
                    })
                  }
                  className={cn(
                    "group/row hover:bg-row-hover",
                    onRowClick && "cursor-pointer",
                    comfortable ? "h-[60px] border-border" : "border-border/40",
                  )}
                >
                  {columns.map((column, index) => (
                    <TableCell
                      key={column.id}
                      className={cn(
                        comfortable ? "px-4 py-2.5" : "px-3 py-2.5",
                        index === 0 && `${PINNED_COLUMN} group-hover/row:bg-row-hover`,
                        index === 0 && !comfortable && PINNED_EDGE,
                        column.className,
                      )}
                    >
                      {index === 0 && selection ? (
                        <div className="flex items-center gap-3">
                          {(selection.isSelectable?.(row) ?? true) ? (
                            <Checkbox
                              aria-label={t("table.selectRow", { name: selection.rowLabel(row) })}
                              checked={selection.selectedIds.has(getRowId(row))}
                              onCheckedChange={(checked) => toggle([getRowId(row)], checked)}
                            />
                          ) : (
                            <span className="size-4 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">{column.cell(row)}</div>
                        </div>
                      ) : (
                        column.cell(row)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          )}
        </table>
        {!rows && !notice && <TableSkeleton />}
        {placeholder}
      </div>
      {(summary || showPager) && (
        <div className="flex min-h-11 items-center gap-3 border-t border-border/60 px-4 py-1.5 text-[13px] text-muted-foreground tabular-nums">
          {summary}
          {showPager && <TablePager {...pager} />}
        </div>
      )}
    </section>
  );
}
