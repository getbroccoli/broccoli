import type { ReactNode } from "react";

type Props = {
  number: number;
  title: string;
  hint: string;
  children: ReactNode;
};

/** One numbered question of the Company defaults page, a fieldset so its options carry its title. */
export function Question({ number, title, hint, children }: Props) {
  return (
    <fieldset className="min-w-0">
      <legend className="flex w-full items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
        >
          {number}
        </span>
        <span className="text-lg font-semibold tracking-tight">{title}</span>
      </legend>
      <p className="mt-0.5 text-sm text-muted-foreground sm:ml-8">{hint}</p>
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}
