import { t } from "@/i18n";
import { dateRange, dayMonthYear, weekdayDay } from "@/lib/formatDate";
import { formatDays } from "@/lib/formatDays";

/** Why a booking can't be made, as the API names it. */
export type RefusalReason =
  | "CLASHES_WITH_TIME_OFF"
  | "NO_WORKING_DAYS"
  | "TYPE_NOT_OFFERED"
  | "OUTSIDE_BOOKING_WINDOW"
  | "OUTSIDE_EMPLOYMENT"
  | "LONGER_THAN_A_YEAR";

import type { DialogMode, Permit, TimeOffStatus } from "@/features/employees";

/** One line of the dialog's balance strip. */
export interface BalanceLine {
  label: string | null;
  before: number | null;
  after: number | null;
  over: string | null;
  unlimited: string | null;
}

/** "2026-12" → the first and last days of December 2026. */
export function monthRange(month: string): { from: string; until: string } {
  const [year, monthIndex] = monthParts(month);
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return { from: `${month}-01`, until: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** The month `by` months after `month`. */
export function shiftMonth(month: string, by: number): string {
  const [year, monthIndex] = monthParts(month);
  return new Date(Date.UTC(year, monthIndex + by, 1)).toISOString().slice(0, 7);
}

/** A valid `YYYY-MM` search value, else the month of `today`. */
export function parseMonth(value: unknown, today: string): string {
  if (typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return value;
  }
  return today.slice(0, 7);
}

/** "That's 2.5 days.", naming the bank holidays that make it less than the working days. */
export function costSentence(preview: {
  cost: number;
  days: readonly {
    date: string;
    reason: "WORKING_DAY" | "BANK_HOLIDAY" | "NOT_A_WORKING_DAY";
    bankHolidayName: string | null;
  }[];
}): string {
  const holidays = preview.days.filter(({ reason }) => reason === "BANK_HOLIDAY");
  if (holidays.length === 0) {
    return t("timeOff.text.costSentence", { days: formatDays(preview.cost) });
  }
  return t("timeOff.text.costSentenceNot", {
    days: formatDays(preview.cost),
    count: String(preview.cost + holidays.length),
    holidays: holidays
      .map(({ date, bankHolidayName }) =>
        t("timeOff.text.holidayIs", { date: weekdayDay(date), name: bankHolidayName ?? "" }),
      )
      .join(", "),
  });
}

/** The balance strip's lines, one per leave year, labelled by year when there are several. */
export function balanceLines(
  balances: readonly {
    periodStart: string;
    balance: "BALANCE_FROM_ALLOWANCE" | "UNLIMITED_BALANCE" | "NO_BALANCE";
    remainingBefore: number | null;
    remainingAfter: number | null;
    usedAfter: number;
  }[],
  firstName: string,
  mode: DialogMode = "book",
): BalanceLine[] {
  return balances.map((change) => {
    const label = balances.length > 1 ? `${change.periodStart.slice(0, 4)}:` : null;
    if (change.remainingBefore === null || change.remainingAfter === null) {
      return {
        label,
        before: null,
        after: null,
        over: null,
        unlimited: t("timeOff.text.unlimited", { days: formatDays(change.usedAfter) }),
      };
    }
    const over =
      change.remainingAfter < 0
        ? mode === "book"
          ? t("timeOff.text.over", { days: formatDays(-change.remainingAfter), name: firstName })
          : t("timeOff.text.overRequest", { days: formatDays(-change.remainingAfter) })
        : null;
    return {
      label,
      before: change.remainingBefore,
      after: change.remainingAfter,
      over,
      unlimited: null,
    };
  });
}

/** The failure callout for a refused booking. */
export function refusalMessage(
  refusal: { reason: RefusalReason; date: string | null },
  context: { firstName: string; typeName: string | null; window: { from: string; until: string } },
): string {
  const name = context.firstName;
  switch (refusal.reason) {
    case "CLASHES_WITH_TIME_OFF":
      return t("timeOff.text.clash", { name, date: weekdayDay(refusal.date!) });
    case "NO_WORKING_DAYS":
      return t("timeOff.text.noWorkingDays", { name });
    case "TYPE_NOT_OFFERED":
      return t("timeOff.text.typeNotOffered", {
        type: context.typeName ?? "",
        name,
        date: dayMonthYear(refusal.date!),
      });
    case "OUTSIDE_BOOKING_WINDOW":
      return t("timeOff.text.outsideWindow", {
        from: dayMonthYear(context.window.from),
        until: dayMonthYear(context.window.until),
      });
    case "OUTSIDE_EMPLOYMENT":
      return t("timeOff.text.outsideEmployment", { name, date: dayMonthYear(refusal.date!) });
    case "LONGER_THAN_A_YEAR":
      return t("timeOff.text.longerThanAYear");
  }
}

/**
 * A bar's tooltip: "Annual leave · 7–9 Dec · 2.5 days", "Off · 3 Nov" when private, and
 * "· Waiting for approval" after a request.
 */
export function bookingTooltip(timeOff: {
  typeName: string | null;
  startDate: string;
  endDate: string;
  cost: number | null;
  status: TimeOffStatus | null;
}): string {
  const type = timeOff.typeName ?? t("timeOff.off");
  const dates = dateRange(timeOff.startDate, timeOff.endDate);
  const tooltip =
    timeOff.cost === null
      ? t("timeOff.tooltipShort", { type, dates })
      : t("timeOff.tooltip", { type, dates, cost: formatDays(timeOff.cost) });
  return timeOff.status === "REQUESTED" ? t("timeOff.tooltipWaiting", { tooltip }) : tooltip;
}

/**
 * How many people are off on each date, approved time off only; a person counts once a date, a
 * half day too. A null status is a colleague's time off, which is always approved.
 */
export function offCounts(
  people: readonly {
    timeOff: readonly { status: TimeOffStatus | null; days: readonly { date: string }[] }[];
  }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const person of people) {
    const dates = new Set(
      person.timeOff
        .filter(({ status }) => status === null || status === "APPROVED")
        .flatMap(({ days }) => days.map(({ date }) => date)),
    );
    for (const date of dates) {
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
  }
  return counts;
}

/** "2.5 days booked for Sam.", or "for you" when the booker books their own. */
export function bookedToast(cost: number, firstName: string, isSelf: boolean): string {
  return t("timeOff.text.booked", {
    days: formatDays(cost),
    name: isSelf ? t("timeOff.text.you") : firstName,
  });
}

/** The types the dialog offers: all of them to book, those that need approval to ask for. */
export function offeredTypes<Type extends { timeOffType: { needsApproval: boolean } }>(
  types: readonly Type[],
  mode: DialogMode,
): Type[] {
  return types.filter(({ timeOffType }) => mode === "book" || timeOffType.needsApproval);
}

/** The page's button: Book when the viewer books anyone straight away, else Request when they may ask. */
export function headerMode(permits: readonly Permit[]): DialogMode | null {
  if (permits.includes("ALLOWED")) return "book";
  return permits.includes("ALLOWED_WITH_APPROVAL") ? "request" : null;
}

/** The dialog's title, footer and button for its mode; the button names the cost once known. */
export function dialogWords(
  mode: DialogMode,
  cost: number | null,
): { title: string; footer: string; button: string } {
  const title = mode === "book" ? t("timeOff.book") : t("timeOff.request");
  const days = cost === null ? null : formatDays(cost);
  return mode === "book"
    ? {
        title,
        footer: t("timeOff.dialog.bookedStraightAway"),
        button: days ? t("timeOff.dialog.bookDays", { days }) : title,
      }
    : {
        title,
        footer: t("timeOff.dialog.sentForApproval"),
        button: days ? t("timeOff.dialog.requestDays", { days }) : title,
      };
}

/** "2.5 days requested." */
export function requestedToast(cost: number): string {
  return t("timeOff.text.requested", { days: formatDays(cost) });
}

function monthParts(month: string): [number, number] {
  const [year, monthNumber] = month.split("-").map(Number);
  return [year!, monthNumber! - 1];
}
