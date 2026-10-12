import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import type { StepView } from "./setupSteps";

/** The current step's title over one bar per step, on narrow screens. */
export function StepBars({ steps }: { steps: StepView[] }) {
  const current = steps.find(({ state }) => state === "current");
  return (
    <div className="md:hidden">
      <p aria-hidden className="text-sm font-semibold">
        {current && t(current.title)}
      </p>
      <ol className="mt-1 flex gap-1">
        {steps.map(({ id, title, state }) => (
          <li
            key={id}
            aria-current={state === "current" ? "step" : undefined}
            className="flex h-6 flex-1 items-center"
          >
            <span
              aria-hidden
              className={cn(
                "h-1 w-full rounded-full",
                state === "current" && "bg-foreground",
                state === "done" && "bg-brand",
                state === "later" && "bg-border",
              )}
            />
            <span className="sr-only">
              {t(title)}
              {state === "done" && ` ${t("setup.completed")}`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
