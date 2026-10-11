import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/class-names";

interface TableStateProps {
  icon: Icon;
  title: string;
  detail?: string;
  action?: ReactNode;
  isError?: boolean;
}

/** A centred message in place of the rows: empty, no results, an error. */
export function TableState({
  icon: StateIcon,
  title,
  detail,
  action,
  isError = false,
}: TableStateProps) {
  return (
    <div
      role={isError ? "alert" : "status"}
      className="flex flex-col items-center gap-3 px-6 py-14 text-center"
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-[10px] bg-muted",
          isError ? "text-destructive" : "text-muted-foreground",
        )}
      >
        <StateIcon size={18} aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        {detail && <p className="text-[12.5px] text-muted-foreground">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

const SKELETON_BAR_WIDTHS = ["max-w-[55%]", "max-w-[70%]", "max-w-[40%]", "max-w-[85%]"];

/** Placeholder rows while the first page loads. */
export function TableSkeleton() {
  return (
    <div aria-hidden className="motion-reduce:[&_*]:animate-none">
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 border-b border-border/40 px-3 py-3 last:border-0"
        >
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <Skeleton
            className={cn("h-3.5 flex-1", SKELETON_BAR_WIDTHS[index % SKELETON_BAR_WIDTHS.length])}
          />
          <Skeleton className="h-3.5 flex-1 max-w-[30%]" />
        </div>
      ))}
    </div>
  );
}
