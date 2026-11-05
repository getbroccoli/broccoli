import type { ReactNode } from "react";

import { cn } from "@/lib/class-names";

type Props = {
  /** "brand" for New and Changed. */
  tone?: "brand";
  children: ReactNode;
};

/** A small label beside a policy's name, such as Standard or Changed. */
export function PolicyTag({ tone, children }: Props) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone ? "bg-brand-soft text-brand-deep" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
