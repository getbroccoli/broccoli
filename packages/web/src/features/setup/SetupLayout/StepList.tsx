import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { PageItem } from "./PageItem";
import type { StepView } from "./setupSteps";
import { StepIcon } from "./StepIcon";

/** The steps as a list with their state, the current step's pages beneath it, on wide screens. */
export function StepList({ steps }: { steps: StepView[] }) {
  return (
    <ol className="hidden flex-col gap-0.5 md:flex">
      {steps.map(({ id, title, state, pages }) => (
        <li key={id} aria-current={state === "current" ? "step" : undefined}>
          <div
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm",
              state === "current" && "font-semibold",
              state === "later" && "text-muted-foreground",
            )}
          >
            <StepIcon state={state} />
            {t(title)}
            {state === "done" && <span className="sr-only"> {t("setup.completed")}</span>}
          </div>
          {state === "current" && pages.length > 0 && (
            <ol className="mb-1 ml-[17px] flex flex-col gap-0.5 border-l border-border py-0.5 pl-2.5">
              {pages.map((page) => (
                <PageItem key={page.id} page={page} />
              ))}
            </ol>
          )}
        </li>
      ))}
    </ol>
  );
}
