import { useQuery } from "@apollo/client/react";
import { Plant } from "@phosphor-icons/react";
import { useRouteContext } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";

import { SetupWorkspaceDocument } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { type SetupStepId, stepViews } from "./setupSteps";
import { StepBars } from "./StepBars";
import { StepList } from "./StepList";

/**
 * How wide the card's content runs: a short centred column such as the owner step, a form,
 * or a table such as the import review.
 */
export type SetupWidth = "narrow" | "default" | "wide";

interface SetupLayoutProps {
  step: SetupStepId;
  title: string;
  description?: string;
  width?: SetupWidth;
  children?: ReactNode;
}

/**
 * The frame of the setup pages: the setup steps beside a card with the step's heading.
 * The card fills the window and its body scrolls; the document does not.
 */
export function SetupLayout({
  step,
  title,
  description,
  width = "default",
  children,
}: SetupLayoutProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { mode } = useRouteContext({ from: "__root__" });
  const steps = stepViews(step, mode);
  // Shares the company's cache entry, so a saved name or logo shows here at once.
  const company = useQuery(SetupWorkspaceDocument).data?.company;

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-app-backdrop text-foreground md:flex-row">
      <title>{`${title} · ${t("app.name")}`}</title>
      <aside className="flex shrink-0 flex-col gap-3 px-3 pt-3 pb-2 md:w-[252px] md:gap-6 md:py-4">
        <div className="flex h-9 min-w-0 items-center gap-2.5 px-2">
          {company?.logoUrl ? (
            <img
              src={company.logoUrl}
              alt=""
              className="size-7 shrink-0 rounded-md bg-card object-contain"
            />
          ) : (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground">
              <Plant size={15} weight="fill" aria-hidden />
            </span>
          )}
          <span
            title={company?.name ?? undefined}
            className="truncate text-[15px] font-semibold tracking-tight"
          >
            {company?.name ?? t("setup.workspaceName")}
          </span>
        </div>
        <nav aria-label={t("setup.progress")} className="px-2 md:px-0">
          <StepList steps={steps} />
          <StepBars steps={steps} />
        </nav>
      </aside>
      <main className="m-2 mt-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 md:my-3 md:mr-3 md:ml-0">
        <header className="shrink-0 px-6 pt-8 sm:px-10 sm:pt-12">
          <div className={cn("mx-auto", HEADER_WIDTHS[width])}>
            <h1
              ref={heading}
              tabIndex={-1}
              className="text-[34px] leading-[1.08] font-semibold tracking-[-0.025em] outline-none"
            >
              {title}
            </h1>
            {description && (
              <p className="mt-3 text-[17px] leading-[1.55] text-muted-foreground">{description}</p>
            )}
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

const HEADER_WIDTHS: Record<SetupWidth, string> = {
  narrow: "max-w-[420px] text-center",
  default: "max-w-[592px]",
  wide: "max-w-[1180px]",
};
