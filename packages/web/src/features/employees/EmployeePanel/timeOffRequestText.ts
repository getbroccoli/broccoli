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

/** How a request ended: whether someone decided it, and who cancelled it, if anyone. */
export interface RequestEnding {
  hasDecision: boolean;
  /** Null when nobody cancelled it, such as an approval that ended without a decision. */
  cancelledBy: "the_person" | "someone_else" | null;
}

/**
 * A status as a chip says it: a request the person cancelled while it waited was withdrawn, one
 * nobody cancelled or decided ended with no decision.
 */
export function statusLabel(status: TimeOffStatus, ending: RequestEnding): string {
  switch (status) {
    case "REQUESTED":
      return t("timeOff.waiting");
    case "APPROVED":
      return t("timeOff.status.approved");
    case "REJECTED":
      return t("timeOff.status.rejected");
    case "CANCELLED":
      if (isWithdrawn(ending)) return t("timeOff.status.withdrawn");
      return ending.hasDecision || ending.cancelledBy
        ? t("timeOff.status.cancelled")
        : t("timeOff.status.endedWithoutDecision");
  }
}

/** Whether the person cancelled their own request while it waited, never decided. */
export function isWithdrawn(ending: RequestEnding): boolean {
  return !ending.hasDecision && ending.cancelledBy === "the_person";
}

/** How a request ended, from its decision and cancellation, for the person it is about. */
export function requestEnding(
  request: { decision: object | null; cancellation: { cancelledBy: { id: string } | null } | null },
  employeeId: string,
): RequestEnding {
  const { decision, cancellation } = request;
  return {
    hasDecision: decision !== null,
    cancelledBy: !cancellation
      ? null
      : cancellation.cancelledBy?.id === employeeId
        ? "the_person"
        : "someone_else",
  };
}

/** The line under a cancelled request: "Withdrawn on Thu 26 Nov.", "Cancelled by Hannah Weber on Thu 26 Nov." or "Cancelled on Thu 26 Nov.". */
export function cancellationLine(cancellation: {
  cancelledAt: string;
  cancelledByName: string | null;
  /** The person cancelled it while it waited, never decided. */
  withdrawn: boolean;
}): string {
  const date = weekdayDayAt(cancellation.cancelledAt);
  if (cancellation.withdrawn) return t("timeOff.cancellation.withdrawnOn", { date });
  return cancellation.cancelledByName
    ? t("timeOff.cancellation.cancelledBy", { name: cancellation.cancelledByName, date })
    : t("timeOff.cancellation.cancelledOn", { date });
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
