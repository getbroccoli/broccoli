import type { EmployeePanel_EmployeeFragment } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { formatCalendarDate } from "@/lib/formatDate";
import { formatDays } from "@/lib/formatDays";

import { decisionLine } from "./timeOffRequestText";
import { TimeOffStatusChip } from "./TimeOffStatusChip";

type Request = NonNullable<EmployeePanel_EmployeeFragment["timeOffRequests"]>[number];

type Props = { requests: readonly Request[] };

/** A person's requests this leave year, newest first, each with its status and decision; none, nothing shown. */
export function TimeOffRequests({ requests }: Props) {
  if (requests.length === 0) return null;
  return (
    <section aria-labelledby="time-off-requests" className="flex flex-col gap-2">
      <h3
        id="time-off-requests"
        className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
      >
        {t("timeOff.requests.title")}
      </h3>
      <ul className="overflow-hidden rounded-xl border border-border text-sm">
        {requests.map((request) => (
          <li
            key={request.id}
            className="flex flex-col gap-1 border-b border-border/60 px-3 py-2 last:border-b-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span>
                <span className="font-medium">{request.timeOffType?.name ?? t("timeOff.off")}</span>
                {" · "}
                {formatDateRange(request.startDate, request.endDate)}
                <span className="text-muted-foreground">
                  {" "}
                  · {formatDays(dayCount(request.days))}
                </span>
              </span>
              {request.status && (
                <TimeOffStatusChip
                  status={request.status}
                  hasDecision={Boolean(request.decision)}
                />
              )}
            </div>
            {/* The chip says enough for a waiting or cancelled request; a decision says who and why. */}
            {request.bookedAt &&
              (request.status === "APPROVED" || request.status === "REJECTED") && (
                <span className="text-xs break-words text-muted-foreground">
                  {decisionLine(
                    request.status,
                    request.decision && {
                      decidedByName: request.decision.decidedBy
                        ? `${request.decision.decidedBy.firstName} ${request.decision.decidedBy.lastName}`
                        : null,
                      decidedAt: request.decision.decidedAt,
                    },
                    request.bookedAt,
                  )}
                  {request.decision?.comment && ` “${request.decision.comment}”`}
                </span>
              )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The days asked for: a full day 1, a morning or an afternoon 0.5. */
function dayCount(days: readonly { dayPart: string }[]): number {
  return days.reduce((sum, { dayPart }) => sum + (dayPart === "FULL_DAY" ? 1 : 0.5), 0);
}

/** "7 Dec 2026 – 9 Dec 2026", or one date. */
function formatDateRange(from: string, until: string): string {
  return from === until
    ? formatCalendarDate(from)!
    : `${formatCalendarDate(from)} – ${formatCalendarDate(until)}`;
}
