import { ArrowsDownUp, CaretDown, CaretUp } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/class-names";

export interface DataTableSort<SortKey extends string = string> {
  key: SortKey;
  direction: "asc" | "desc";
}

interface SortableHeaderProps<SortKey extends string> {
  label: string;
  sortKey: SortKey | undefined;
  sort: DataTableSort<SortKey>;
  onSortChange: (sort: DataTableSort<SortKey>) => void;
  density: DataTableDensity;
  className?: string;
  /** Shown before the label, such as a checkbox that selects the page. */
  leading?: ReactNode;
}

/** Compact lists such as the directory, or comfortable ones with fewer, taller rows. */
export type DataTableDensity = "compact" | "comfortable";

const HEAD_TEXT: Record<DataTableDensity, string> = {
  compact: "h-9 px-3 text-[10.5px] font-medium tracking-wider text-muted-foreground uppercase",
  comfortable: "h-11 px-4 text-sm font-medium text-foreground",
};

/** A column header; a button that sorts by the column when it has a `sortKey`. */
export function SortableHeader<SortKey extends string>({
  label,
  sortKey,
  sort,
  onSortChange,
  density,
  className,
  leading,
}: SortableHeaderProps<SortKey>) {
  const headClassName = cn(HEAD_TEXT[density], className);
  if (!sortKey) {
    return (
      <TableHead className={headClassName}>
        <HeadContent leading={leading}>{label}</HeadContent>
      </TableHead>
    );
  }

  const direction = sort.key === sortKey ? sort.direction : undefined;
  const nextDirection = direction === "asc" ? "desc" : "asc";

  return (
    <TableHead aria-sort={direction ? `${direction}ending` : "none"} className={headClassName}>
      <HeadContent leading={leading}>
        <button
          type="button"
          onClick={() => onSortChange({ key: sortKey, direction: nextDirection })}
          className="group/head -mx-1 inline-flex items-center gap-1 rounded-sm px-1 [text-transform:inherit] outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {label}
          <SortIcon direction={direction} />
        </button>
      </HeadContent>
    </TableHead>
  );
}

function SortIcon({ direction }: { direction: DataTableSort["direction"] | undefined }) {
  if (direction === "asc") return <CaretUp size={10} weight="bold" aria-hidden />;
  if (direction === "desc") return <CaretDown size={10} weight="bold" aria-hidden />;
  return (
    <ArrowsDownUp
      size={10}
      weight="bold"
      aria-hidden
      className="opacity-0 transition-opacity group-hover/head:opacity-40 group-focus-visible/head:opacity-40"
    />
  );
}

function HeadContent({ leading, children }: { leading: ReactNode; children: ReactNode }) {
  return leading ? (
    <div className="flex items-center gap-3">
      {leading}
      {children}
    </div>
  ) : (
    children
  );
}
