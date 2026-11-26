import type { ReactNode } from "react";

type Props = {
  label: string;
  hint?: string;
  /** The control the label names, when it is a single form control. */
  htmlFor?: string;
  children: ReactNode;
};

/** A labelled field of the dialog. */
export function Field({ label, hint, htmlFor, children }: Props) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-muted-foreground">
        {label} {hint && <span className="font-normal">· {hint}</span>}
      </Label>
      {children}
    </div>
  );
}
