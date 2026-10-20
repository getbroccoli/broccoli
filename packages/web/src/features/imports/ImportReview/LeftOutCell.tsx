import type { ReactNode } from "react";

import { cn } from "@/lib/class-names";

/** A review cell, dimmed when its import employee is left out. */
export function LeftOutCell({ leftOut, children }: { leftOut: boolean; children: ReactNode }) {
  return <div className={cn("min-w-0", leftOut && "opacity-50")}>{children}</div>;
}
