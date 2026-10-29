import { CalendarBlank, Envelope, Hourglass } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { SignInStatusFragment } from "@/__generated__/graphql";
import { InviteButton, SignInLine } from "@/features/invites";
import { t } from "@/i18n";
import { calendarDayOf } from "@/lib/calendarDay";
import { formatCalendarDate } from "@/lib/formatDate";
import { tenureOf } from "@/lib/tenure";

type Props = {
  startDate: string | null;
  email: string;
  /** Shown to admins only, on the work email with its invite action. */
  signIn: { status: SignInStatusFragment; onInvite: () => void } | null;
};

/** The facts at the top of a person's panel: start date, tenure and work email with sign-in. */
export function KeyFacts({ startDate, email, signIn }: Props) {
  const tenure = tenureOf(startDate, calendarDayOf(new Date()));
  const facts: {
    icon: Icon;
    label: string;
    value: string;
    /** Beside the label, such as the sign-in state. */
    status?: ReactNode;
    /** Beside the value, such as the invite action. */
    action?: ReactNode;
  }[] = [
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
    {
      icon: Envelope,
      label: t("people.panel.fact.email"),
      value: email,
      status: signIn && <SignInLine status={signIn.status} />,
      action: signIn && <InviteButton status={signIn.status} onInvite={signIn.onInvite} />,
    },
  ];

  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
      {facts.map(({ icon: FactIcon, label, value, status, action }) => (
        <div key={label} className="rounded-xl border border-border px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            <FactIcon aria-hidden className="size-3.5" />
            {label}
            {status && (
              <span className="ml-auto font-normal tracking-normal text-foreground normal-case">
                {status}
              </span>
            )}
          </dt>
          <dd className="flex items-center gap-2 pt-1 text-sm font-medium">
            <span className="min-w-0 flex-1 truncate">{value}</span>
            {action}
          </dd>
        </div>
      ))}
    </dl>
  );
}
