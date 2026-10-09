import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
}

/** The title block at the top of every page. */
export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-1 pb-6">
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight">{title}</h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </header>
  );
}
