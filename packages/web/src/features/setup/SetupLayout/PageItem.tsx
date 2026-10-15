import { Check } from "@phosphor-icons/react";

import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import type { PageView } from "./setupSteps";

/** One page of the current step: a card while current, a check once done. */
export function PageItem({ page: { title, state } }: { page: PageView }) {
  return (
    <li
      aria-current={state === "current" ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px]",
        state === "current" &&
          "bg-card font-medium shadow-[0_1px_2px_rgba(33,30,23,0.06)] ring-1 ring-border",
        state === "later" && "text-muted-foreground",
      )}
    >
      <span className="truncate">{t(title)}</span>
      {state === "done" && (
        <>
          <Check size={12} weight="bold" className="ml-auto shrink-0 text-brand-deep" aria-hidden />
          <span className="sr-only"> {t("setup.completed")}</span>
        </>
      )}
    </li>
  );
}
