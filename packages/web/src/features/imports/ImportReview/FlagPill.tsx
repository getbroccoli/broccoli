import type { ComponentProps } from "react";

import { cn } from "@/lib/class-names";

/** The amber pill of something to check, such as a conflict or why Approve leaves someone out. */
export function FlagPill({ className, children, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 text-xs font-medium text-amber-900",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber-500" />
      {children}
    </span>
  );
}
