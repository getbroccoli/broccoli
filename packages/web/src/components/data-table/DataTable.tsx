import type { ReactNode } from "react";

import { TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/class-names";

import { SortableHeader, type DataTableSort } from "./SortableHeader";
import { TablePager, type DataTablePager } from "./TablePager";
import { TableSkeleton } from "./TableStates";

// The first column stays put while the rows scroll sideways; the inset shadow marks its edge.
const PINNED_COLUMN = "sticky left-0 z-10 bg-card shadow-[inset_-1px_0_0_var(--color-border)]";

export interface DataTableColumn<Row, SortKey extends string = string> {
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Set to make the column sortable by this key. */
  sortKey?: SortKey;
  className?: string;
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
}: DataTableProps<Row, SortKey>) {
  const placeholder = notice ?? (rows?.length === 0 ? emptyState : undefined);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {toolbar && (
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5">
          {toolbar}
        </div>
      )}
      <div className="subtle-scrollbar max-h-[70vh] overflow-auto">
        <table aria-busy={isLoading} className="w-full text-[12.5px]">
          <TableHeader className="sticky top-0 z-20 bg-card [&_tr]:border-border/60">
            <TableRow className="hover:bg-transparent">
              {columns.map((column, index) => (
                <SortableHeader
                  key={column.id}
                  label={column.header}
                  sortKey={column.sortKey}
                  sort={sort}
                  onSortChange={onSortChange}
                  className={cn(index === 0 && PINNED_COLUMN, column.className)}
                />
              ))}
            </TableRow>
          </TableHeader>
          {rows && !placeholder && (
            <TableBody className={cn("transition-opacity", isLoading && "opacity-60")}>
              {rows.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  className="group/row border-border/40 hover:bg-row-hover"
                >
                  {columns.map((column, index) => (
                    <TableCell
                      key={column.id}
                      className={cn(
                        "px-3 py-2.5",
                        index === 0 && `${PINNED_COLUMN} group-hover/row:bg-row-hover`,
                        column.className,
                      )}
                    >
                      {column.cell(row)}
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
      {pager && !notice && <TablePager {...pager} />}
    </section>
  );
}
