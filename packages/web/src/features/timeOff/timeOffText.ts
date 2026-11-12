import { t } from "@/i18n";
import { calendarDayParts } from "@/lib/calendarDay";
import { formatDays } from "@/lib/formatDays";

/** Why a booking can't be made, as the API names it. */
export type RefusalReason =
  | "CLASHES_WITH_TIME_OFF"
  | "NO_WORKING_DAYS"
  | "TYPE_NOT_OFFERED"
  | "OUTSIDE_BOOKING_WINDOW"
  | "OUTSIDE_EMPLOYMENT"
  | "LONGER_THAN_A_YEAR";

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
        ? t("timeOff.text.over", { days: formatDays(-change.remainingAfter), name: firstName })
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

/** A bar's tooltip: "Annual leave · 7–9 Dec · 2.5 days", or "Off · 3 Nov" when private. */
export function bookingTooltip(timeOff: {
  typeName: string | null;
  startDate: string;
  endDate: string;
  cost: number | null;
}): string {
  const type = timeOff.typeName ?? t("timeOff.off");
  const dates = dateRange(timeOff.startDate, timeOff.endDate);
  return timeOff.cost === null
    ? t("timeOff.tooltipShort", { type, dates })
    : t("timeOff.tooltip", { type, dates, cost: formatDays(timeOff.cost) });
}

/** How many people are off on each date; a person counts once a date, a half day too. */
export function offCounts(
  people: readonly { timeOff: readonly { days: readonly { date: string }[] }[] }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const person of people) {
    const dates = new Set(person.timeOff.flatMap(({ days }) => days.map(({ date }) => date)));
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

/** A booking's dates with their year: "7–9 Dec 2026", or "30 Dec 2026 – 4 Jan 2027" across years. */
export function bookingDates(from: string, until: string): string {
  return from.slice(0, 4) === until.slice(0, 4)
    ? `${dateRange(from, until)} ${from.slice(0, 4)}`
    : `${dayMonthYear(from)} – ${dayMonthYear(until)}`;
}

/** "Tue 8 Dec". */
export function weekdayDay(date: string): string {
  return format(date, { weekday: "short", day: "numeric", month: "short" });
}

/** "4 Jan 2027". */
export function dayMonthYear(date: string): string {
  return format(date, { day: "numeric", month: "short", year: "numeric" });
}

/** "7–9 Dec", "30 Dec – 4 Jan", or "3 Nov" for one day. */
export function dateRange(from: string, until: string): string {
  if (from === until) {
    return format(from, { day: "numeric", month: "short" });
  }
  if (from.slice(0, 7) === until.slice(0, 7)) {
    return `${Number(from.slice(8))}–${format(until, { day: "numeric", month: "short" })}`;
  }
  return `${format(from, { day: "numeric", month: "short" })} – ${format(until, { day: "numeric", month: "short" })}`;
}

function format(date: string, options: Intl.DateTimeFormatOptions): string {
  // en-GB puts a comma after the weekday; the copy reads "Tue 8 Dec".
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" })
    .format(Date.UTC(...calendarDayParts(date)))
    .replace(",", "");
}

function monthParts(month: string): [number, number] {
  const [year, monthNumber] = month.split("-").map(Number);
  return [year!, monthNumber! - 1];
}
