import { CalendarBlank, Envelope, Hourglass } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

import { t } from "@/i18n";
import { calendarDayOf } from "@/lib/calendarDay";
import { formatCalendarDate } from "@/lib/formatDate";
import { tenureOf } from "@/lib/tenure";

type Props = {
  startDate: string | null;
  email: string;
};

/** The facts at the top of a person's panel: start date, tenure and work email. */
export function KeyFacts({ startDate, email }: Props) {
  const tenure = tenureOf(startDate, calendarDayOf(new Date()));
  const facts: { icon: Icon; label: string; value: string }[] = [
    ...(startDate
      ? [
          {
            icon: CalendarBlank,
            label: t("people.panel.fact.startDate"),
            value: formatCalendarDate(startDate)!,
          },
        ]
      : []),
    ...(tenure ? [{ icon: Hourglass, label: t("people.panel.fact.tenure"), value: tenure }] : []),
    { icon: Envelope, label: t("people.panel.fact.email"), value: email },
  ];

  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
      {facts.map(({ icon: FactIcon, label, value }) => (
        <div key={label} className="rounded-xl border border-border px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            <FactIcon aria-hidden className="size-3.5" />
            {label}
          </dt>
          <dd className="truncate pt-1 text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
