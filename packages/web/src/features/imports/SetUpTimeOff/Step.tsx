import type { ReactNode } from "react";

import { t } from "@/i18n";

type Props = {
  number: number;
  title: string;
  hint: string;
  children: ReactNode;
};

/** One numbered question of the Set up time off page. */
export function Step({ number, title, hint, children }: Props) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("setup.timeOff.stepNumber", { number: String(number) })}
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}
