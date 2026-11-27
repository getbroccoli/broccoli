import { type MessageKey, t } from "@/i18n";
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

import type {
  TimeOffApproval,
  TimeOffDayCostReason,
  TimeOffDayPart,
  WhosOutDayKind,
} from "@/__generated__/graphql";
import { type DialogMode, modeOf, type Permit, type TimeOffStatus } from "@/features/employees";

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
    days: readonly { date: string; kind: WhosOutDayKind }[];
    timeOff: readonly { status: TimeOffStatus | null; days: readonly { date: string }[] }[];
  }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const person of people) {
    // A booked day the person no longer works, such as after their week changed, isn't time off.
    const working = new Set(
      person.days.filter(({ kind }) => kind === "WORKING_DAY").map(({ date }) => date),
    );
    const dates = new Set(
      person.timeOff
        .filter(({ status }) => status === null || status === "APPROVED")
        .flatMap(({ days }) => days.map(({ date }) => date))
        .filter((date) => working.has(date)),
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

/** A request turns into a booking for a type nobody approves. */
export function modeForType(mode: DialogMode, approval: TimeOffApproval | null): DialogMode {
  return approval === "NO_APPROVAL" ? "book" : mode;
}

/** The dialog's mode before anyone is picked: Book when the viewer books anyone straight away, else Request. */
export function unpickedMode(permits: readonly Permit[]): DialogMode | null {
  if (permits.includes("ALLOWED")) return "book";
  return permits.includes("ALLOWED_WITH_APPROVAL") ? "request" : null;
}

/** The page's buttons: the viewer's own time off, and Book for someone when they book anyone else straight away. */
export function headerButtons(
  people: readonly { id: string; canCreate: Permit }[],
  viewerEmployeeId: string | null,
): { own: DialogMode | null; forSomeone: boolean } {
  const own = people.find(({ id }) => id === viewerEmployeeId);
  return {
    own: own ? modeOf(own.canCreate) : null,
    forSomeone: people.some(
      ({ id, canCreate }) => id !== viewerEmployeeId && canCreate === "ALLOWED",
    ),
  };
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

/** "8 days deducted from Annual leave" when it takes from an allowance, else its days: "3 days". */
export function bookingTotal({
  cost,
  deductedDays,
  typeName,
}: {
  cost: number;
  deductedDays: number | null;
  typeName: string;
}): string {
  return deductedDays === null
    ? formatDays(cost)
    : t("timeOff.details.deductedFrom", { days: formatDays(deductedDays), type: typeName });
}

/** One booked day and what it adds: "Full day · 1 day", "Non-working day · 0 days". */
export function dayCostLine({
  dayPart,
  cost,
  reason,
}: {
  dayPart: TimeOffDayPart;
  cost: number;
  reason: TimeOffDayCostReason;
}): string {
  return t("timeOff.details.dayCost", {
    part: t(reason === "WORKING_DAY" ? DAY_PART_LABELS[dayPart] : DAY_REASON_LABELS[reason]),
    days: formatDays(cost),
  });
}

/**
 * The words for cancelling this time off: the person withdraws their own request, others cancel
 * it, and approved time off is cancelled; `confirm` is also the button that opens the confirmation.
 */
export function cancelDialogWords(
  status: "REQUESTED" | "APPROVED",
  byThePerson: boolean,
  values: { name: string; type: string; dates: string },
) {
  const words = CANCEL_WORDS[cancelActionOf(status, byThePerson)];
  return {
    title: t(words.title),
    body: t(words.body, values),
    keep: t(words.keep),
    confirm: t(words.button),
    done: t(words.done),
  };
}

function monthParts(month: string): [number, number] {
  const [year, monthNumber] = month.split("-").map(Number);
  return [year!, monthNumber! - 1];
}

type CancelAction = "withdrawRequest" | "cancelRequest" | "cancelOwnTimeOff" | "cancelTimeOff";

function cancelActionOf(status: "REQUESTED" | "APPROVED", byThePerson: boolean): CancelAction {
  if (status === "REQUESTED") return byThePerson ? "withdrawRequest" : "cancelRequest";
  return byThePerson ? "cancelOwnTimeOff" : "cancelTimeOff";
}

const CANCEL_WORDS = {
  withdrawRequest: {
    button: "timeOff.cancel.withdrawButton",
    title: "timeOff.cancel.withdrawTitle",
    body: "timeOff.cancel.withdrawBody",
    keep: "timeOff.cancel.keepRequest",
    done: "timeOff.cancel.withdrawDone",
  },
  cancelRequest: {
    button: "timeOff.cancel.requestButton",
    title: "timeOff.cancel.requestTitle",
    body: "timeOff.cancel.requestBody",
    keep: "timeOff.cancel.keepRequest",
    done: "timeOff.cancel.requestDone",
  },
  cancelOwnTimeOff: {
    button: "timeOff.cancel.timeOffButton",
    title: "timeOff.cancel.timeOffTitle",
    body: "timeOff.cancel.ownTimeOffBody",
    keep: "timeOff.cancel.keepTimeOff",
    done: "timeOff.cancel.timeOffDone",
  },
  cancelTimeOff: {
    button: "timeOff.cancel.timeOffButton",
    title: "timeOff.cancel.timeOffTitle",
    body: "timeOff.cancel.timeOffBody",
    keep: "timeOff.cancel.keepTimeOff",
    done: "timeOff.cancel.timeOffDone",
  },
} as const satisfies Record<CancelAction, Record<string, MessageKey>>;

const DAY_PART_LABELS = {
  FULL_DAY: "timeOff.dialog.fullDay",
  MORNING: "timeOff.dialog.morning",
  AFTERNOON: "timeOff.dialog.afternoon",
} as const satisfies Record<TimeOffDayPart, MessageKey>;

const DAY_REASON_LABELS = {
  NOT_A_WORKING_DAY: "timeOff.details.notWorkingDay",
  BANK_HOLIDAY: "timeOff.details.bankHoliday",
} as const satisfies Record<Exclude<TimeOffDayCostReason, "WORKING_DAY">, MessageKey>;
