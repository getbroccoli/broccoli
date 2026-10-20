import type { ReactNode } from "react";

import { cn } from "@/lib/class-names";

import type { SetupWidth } from "./SetupLayout";

interface SetupStepFormProps {
  onSubmit: () => void;
  children: ReactNode;
  /** The step's button, on the right of the footer. */
  footer: ReactNode;
  /** Match the layout's width. */
  width?: SetupWidth;
}

/** The body of a setup step: the fields scroll inside the card above a fixed footer. */
export function SetupStepForm({
  onSubmit,
  children,
  footer,
  width = "default",
}: SetupStepFormProps) {
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn("mx-auto flex w-full flex-col gap-8 p-6 sm:p-10", CONTENT_WIDTHS[width])}
        >
          {children}
        </div>
      </div>
      <footer className="flex shrink-0 justify-end border-t border-border px-6 py-3 sm:px-10">
        {footer}
      </footer>
    </form>
  );
}

// Each holds the matching header width of `SetupLayout` plus the side padding.
const CONTENT_WIDTHS: Record<SetupWidth, string> = {
  narrow: "max-w-[500px]",
  default: "max-w-2xl",
  wide: "max-w-[1180px]",
};
