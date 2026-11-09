import type { ReactNode } from "react";

type Props = {
  label: string;
  hint?: string;
  children: ReactNode;
};

/** A labelled field of the dialog. */
export function Field({ label, hint, children }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-muted-foreground">
        {label} {hint && <span className="font-normal">· {hint}</span>}
      </span>
      {children}
    </div>
  );
}
