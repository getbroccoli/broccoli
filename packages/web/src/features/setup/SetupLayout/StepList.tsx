import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import type { StepView } from "./setupSteps";
import { StepIcon } from "./StepIcon";

export /** The steps as a list with their state, on wide screens. */
function StepList({ steps }: { steps: StepView[] }) {
  return (
    <ol className="hidden flex-col gap-0.5 md:flex">
      {steps.map(({ id, title, state }) => (
        <li
          key={id}
          aria-current={state === "current" ? "step" : undefined}
          className={cn(
            "flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm",
            state === "current" && "font-semibold",
            state === "later" && "text-muted-foreground",
          )}
        >
          <StepIcon state={state} />
          {t(title)}
          {state === "done" && <span className="sr-only"> {t("setup.completed")}</span>}
        </li>
      ))}
    </ol>
  );
}
