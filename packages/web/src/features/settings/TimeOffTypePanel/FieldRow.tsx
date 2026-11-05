import type { ReactNode } from "react";

import { t } from "@/i18n";

type Props = {
  label: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
};

/** A labelled field of the panel, in its two-column grid, with its error beneath. */
export function FieldRow({ label, htmlFor, error, children }: Props) {
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

const ERROR_MESSAGES: Record<
  string,
  "settings.timeOffType.required" | "settings.timeOffType.taken" | "settings.timeOffType.invalid"
> = {
  required: "settings.timeOffType.required",
  taken: "settings.timeOffType.taken",
  invalid: "settings.timeOffType.invalid",
};
