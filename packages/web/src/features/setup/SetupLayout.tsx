import { CheckCircle, Circle, Plant } from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode } from "react";

import { t, type MessageKey } from "@/i18n";
import { cn } from "@/lib/class-names";

const SETUP_STEPS = [
  { id: "owner", title: "setup.owner.title" },
  { id: "company", title: "setup.company.title" },
] as const satisfies readonly { id: string; title: MessageKey }[];

export type SetupStepId = (typeof SETUP_STEPS)[number]["id"];

type StepState = "done" | "current" | "later";

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
  const currentIndex = SETUP_STEPS.findIndex(({ id }) => id === step);
  const steps = SETUP_STEPS.map((item, index) => ({
    ...item,
    state: stepState(index, currentIndex),
  }));

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
          <StepBars steps={steps} currentTitle={t(SETUP_STEPS[currentIndex]!.title)} />
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

interface StepView {
  id: SetupStepId;
  title: MessageKey;
  state: StepState;
}

/** The steps as a list with their state, on wide screens. */
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

/** The current step's title over one bar per step, on narrow screens. */
function StepBars({ steps, currentTitle }: { steps: StepView[]; currentTitle: string }) {
  return (
    <div className="md:hidden">
      <p aria-hidden className="text-sm font-semibold">
        {currentTitle}
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

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return <CheckCircle size={18} weight="fill" className="shrink-0 text-brand" aria-hidden />;
  }
  if (state === "current") {
    return (
      <span
        aria-hidden
        className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground"
      >
        <span className="size-2 rounded-full bg-foreground" />
      </span>
    );
  }
  return <Circle size={18} className="shrink-0" aria-hidden />;
}

function stepState(index: number, currentIndex: number): StepState {
  if (index < currentIndex) {
    return "done";
  }
  return index === currentIndex ? "current" : "later";
}
