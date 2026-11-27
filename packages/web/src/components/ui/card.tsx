import { type ReactNode, useId } from "react";

import { cn } from "@/lib/class-names";

type Props = {
  title: string;
  /** Beside the title, such as a link to the full page. */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/** A titled, bordered block on a page, such as one part of Today. */
export function Card({ title, action, children, className }: Props) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn("flex flex-col gap-3 rounded-2xl border border-border bg-card p-5", className)}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id={titleId} className="mr-auto text-base font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
