import { Plant } from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode } from "react";

import { t } from "@/i18n";

import { type SetupStepId, stepViews } from "./setup-steps";
import { StepBars } from "./StepBars";
import { StepList } from "./StepList";

interface SetupLayoutProps {
  step: SetupStepId;
  title: string;
  description: string;
  children?: ReactNode;
}

/**
 * The frame of the setup pages: the setup steps beside a card with the step's heading.
 * The card fills the window and its body scrolls; the document does not.
 */
export function SetupLayout({ step, title, description, children }: SetupLayoutProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const steps = stepViews(step);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-app-backdrop text-foreground md:flex-row">
      <title>{`${title} · ${t("app.name")}`}</title>
      <aside className="flex shrink-0 flex-col gap-3 px-3 pt-3 pb-2 md:w-[252px] md:gap-6 md:py-4">
        <div className="flex h-9 min-w-0 items-center gap-2.5 px-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground">
            <Plant size={15} weight="fill" aria-hidden />
          </span>
          <span className="truncate text-[15px] font-semibold tracking-tight">
            {t("setup.workspaceName")}
          </span>
        </div>
        <nav aria-label={t("setup.progress")} className="px-2 md:px-0">
          <StepList steps={steps} />
          <StepBars steps={steps} />
        </nav>
      </aside>
      <main className="m-2 mt-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 md:my-3 md:mr-3 md:ml-0">
        <header className="shrink-0 px-6 pt-8 sm:px-10 sm:pt-12">
          <div className="mx-auto max-w-[592px]">
            <h1
              ref={heading}
              tabIndex={-1}
              className="text-[34px] leading-[1.08] font-semibold tracking-[-0.025em] outline-none"
            >
              {title}
            </h1>
            <p className="mt-3 text-[17px] leading-[1.55] text-muted-foreground">{description}</p>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
