import type { ReactNode } from "react";

interface SetupStepFormProps {
  onSubmit: () => void;
  children: ReactNode;
  /** The step's button, on the right of the footer. */
  footer: ReactNode;
}

/** The body of a setup step: the fields scroll inside the card above a fixed footer. */
export function SetupStepForm({ onSubmit, children, footer }: SetupStepFormProps) {
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
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6 sm:p-10">{children}</div>
      </div>
      <footer className="flex shrink-0 justify-end border-t border-border px-6 py-3 sm:px-10">
        {footer}
      </footer>
    </form>
  );
}
