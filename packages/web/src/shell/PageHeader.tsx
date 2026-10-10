import type { ReactNode } from "react";

import { t } from "@/i18n";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
}

/**
 * The title block at the top of every page. It also sets the document title, and its
 * heading receives focus after client-side navigation (see `useFocusHeadingOnNavigation`).
 */
export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-1 pb-6">
      <title>{`${title} · ${t("app.name")}`}</title>
      <h1
        tabIndex={-1}
        className="text-[26px] leading-tight font-semibold tracking-tight outline-none"
      >
        {title}
      </h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </header>
  );
}
