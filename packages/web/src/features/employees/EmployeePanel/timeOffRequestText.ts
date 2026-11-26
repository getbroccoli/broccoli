import type { Permit, TimeOffStatus } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { calendarDayOf } from "@/lib/calendarDay";
import { weekdayDay } from "@/lib/formatDate";
import { formatDays } from "@/lib/formatDays";

export type { Permit, TimeOffStatus };

/** Whether time off is booked straight away or asked for. */
export type DialogMode = "book" | "request";

/** Whether the viewer books someone's time off straight away, asks for it, or can do neither. */
export function modeOf(permit: Permit): DialogMode | null {
  return permit === "ALLOWED" ? "book" : permit === "ALLOWED_WITH_APPROVAL" ? "request" : null;
}

/** A status as a chip says it; a cancelled request without a decision ended with none. */
export function statusLabel(status: TimeOffStatus, hasDecision: boolean): string {
  switch (status) {
    case "REQUESTED":
      return t("timeOff.waiting");
    case "APPROVED":
      return t("timeOff.status.approved");
    case "REJECTED":
      return t("timeOff.status.rejected");
    case "CANCELLED":
      return hasDecision ? t("timeOff.status.cancelled") : t("timeOff.status.endedWithoutDecision");
  }
}

/** Who decided a request and when: "Approved by Rachel Doyle on Fri 27 Nov.", or since when it waits. */
export function decisionLine(
  status: TimeOffStatus,
  decision: { decidedByName: string | null; decidedAt: string } | null,
  requestedAt: string,
): string {
  if (status === "REQUESTED") {
    return t("timeOff.decision.waitingSince", { date: weekdayDayAt(requestedAt) });
  }
  if (status === "CANCELLED" || !decision) {
    return decision ? t("timeOff.decision.cancelled") : t("timeOff.decision.endedWithoutDecision");
  }
  const date = weekdayDayAt(decision.decidedAt);
  const name = decision.decidedByName;
  if (status === "APPROVED") {
    return name
      ? t("timeOff.decision.approvedBy", { name, date })
      : t("timeOff.decision.approvedOn", { date });
  }
  return name
    ? t("timeOff.decision.rejectedBy", { name, date })
    : t("timeOff.decision.rejectedOn", { date });
}

/** "2.5 days waiting for approval", or null when nothing waits. */
export function waitingLine(days: number): string | null {
  return days > 0 ? t("timeOff.text.waitingLine", { days: formatDays(days) }) : null;
}

/** Days recorded of a type with no balance, and what waits beside them: "1 day recorded · 1.5 waiting". */
export function recordedLine(used: number, waiting: number): string {
  return waiting > 0
    ? t("timeOff.text.recordedWaiting", {
        days: formatDays(used),
        waiting: new Intl.NumberFormat("en-GB").format(waiting),
      })
    : t("timeOff.text.recorded", { days: formatDays(used) });
}

/** An instant's day in London, where the company's days are, as `weekdayDay` reads it: "Fri 27 Nov". */
function weekdayDayAt(instant: string): string {
  return weekdayDay(calendarDayOf(new Date(instant), "Europe/London"));
}
