import type { ReactNode } from "react";

import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

/** A labelled field of the panel, in its two-column grid, with its error beneath. */
export function Row({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <>
      <Label htmlFor={htmlFor} className="pt-1.5 text-sm font-medium">
        {label}
      </Label>
      <div className="flex flex-col gap-1.5">
        {children}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {t(ERROR_MESSAGES[error] ?? "settings.timeOffType.invalid")}
          </p>
        )}
      </div>
    </>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export function Tag({ tone, children }: { tone?: "brand"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone ? "bg-brand-soft text-brand-deep" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

const ERROR_MESSAGES: Record<
  string,
  "settings.timeOffType.required" | "settings.timeOffType.taken" | "settings.timeOffType.invalid"
> = {
  required: "settings.timeOffType.required",
  taken: "settings.timeOffType.taken",
  invalid: "settings.timeOffType.invalid",
};
