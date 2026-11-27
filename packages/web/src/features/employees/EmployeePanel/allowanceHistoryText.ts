import type { AllowanceChangeCause, AllowanceHistoryQuery } from "@/__generated__/graphql";
import { type MessageKey, t } from "@/i18n";
import { calendarDayOf } from "@/lib/calendarDay";
import { bookingDates, dateRange, dayMonthYear } from "@/lib/formatDate";
import { formatDayCount, formatDays } from "@/lib/formatDays";

/** One change to a balance as the history query reads it. */
export type AllowanceChange = NonNullable<
  NonNullable<NonNullable<AllowanceHistoryQuery["employee"]>["timeOffTypes"]>[number]["history"]
>[number];

/** The figures a change leaves on the card. */
type FigureField = "entitlementAfter" | "bankHolidaysAfter" | "usedAfter";

/** What happened, in words: "Booked 7–9 Dec 2026", "Adjusted by you". */
export function changeTitle(change: AllowanceChange, readerUserId: string): string {
  switch (change.cause) {
    case "ALLOWANCE_ADJUSTED":
      return t("people.panel.timeOff.history.adjusted", {
        author: authorName(change, readerUserId),
      });
    case "ALLOWANCE_ADJUSTMENT_REVERSED":
      return t("people.panel.timeOff.history.reversed", {
        amount: signedDays(-change.amount),
        author: authorName(change, readerUserId),
      });
    case "TIME_OFF_BOOKED":
    case "TIME_OFF_APPROVED":
    case "TIME_OFF_CANCELLED":
      // A booking can also start a balance, whose grant carries the booking as its cause.
      return change.firstBookedDay && change.lastBookedDay
        ? t(BOOKING_TITLES[change.cause], {
            dates: bookingDates(change.firstBookedDay, change.lastBookedDay),
          })
        : t("people.panel.timeOff.history.dailyCheck");
    default:
      return change.causeDate
        ? t(CAUSE_TITLES[change.cause], { date: dayMonthYear(change.causeDate) })
        : t(UNDATED_CAUSE_TITLES[change.cause]);
  }
}

/** The confirmation's words for reversing an adjustment, with the balance it leaves. */
export function reverseWords(
  change: Pick<AllowanceChange, "amount" | "recordedAt">,
  balance: { remaining: number; firstName: string; isReader: boolean },
  today: string,
) {
  const values = {
    days: formatDays(Math.abs(change.amount)),
    date: recordedDate(change.recordedAt, today),
  };
  const left = formatDays(balance.remaining - change.amount);
  return {
    title: t("people.panel.timeOff.reverse.title"),
    body: [
      t(
        change.amount > 0
          ? "people.panel.timeOff.reverse.takesAway"
          : "people.panel.timeOff.reverse.givesBack",
        values,
      ),
      balance.isReader
        ? t("people.panel.timeOff.reverse.leftForYou", { days: left })
        : t("people.panel.timeOff.reverse.left", { name: balance.firstName, days: left }),
    ].join(" "),
    keep: t("people.panel.timeOff.reverse.keep"),
    confirm: t("people.panel.timeOff.reverse.confirm"),
    done: t("people.panel.timeOff.reverse.done"),
  };
}

/** "27 Nov", the day the change was recorded in London, with the year when it isn't today's. */
export function recordedDate(recordedAt: string, today: string): string {
  const day = calendarDayOf(new Date(recordedAt), "Europe/London");
  return day.slice(0, 4) === today.slice(0, 4) ? dateRange(day, day) : dayMonthYear(day);
}

/** How the card's figures moved in a change, each with its effect on the days left; empty where the title says it. */
export function figureLines(
  change: Pick<AllowanceChange, "cause" | FigureField>,
  previous: Pick<AllowanceChange, FigureField> | undefined,
): { text: string; amount: string }[] {
  const lines = FIGURES.flatMap(({ field, words, takes }) => {
    const before = previous?.[field] ?? 0;
    const after = change[field];
    if (before === after) {
      return [];
    }
    return [
      {
        text: t(words, { before: formatDayCount(before), after: formatDayCount(after) }),
        amount: signedDays(takes ? before - after : after - before),
      },
    ];
  });
  return lines.length === 1 && TITLED_CAUSES.has(change.cause) ? [] : lines;
}

/** Days with their sign: "+2", "−2.5". */
export function signedDays(amount: number): string {
  return `${amount < 0 ? "−" : "+"}${formatDayCount(Math.abs(amount))}`;
}

/** The days typed into the adjust dialog, or null unless a non-zero change of at most two decimals within a year. */
export function parseAdjustment(text: string): number | null {
  const normalised = text.trim().replace("−", "-");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalised)) {
    return null;
  }
  const days = Number(normalised);
  return days === 0 || Math.abs(days) > MAX_ADJUSTMENT_DAYS ? null : days;
}

/** The adjust dialog's button: "Add 2 days", "Take away 1.5 days". */
export function adjustLabel(amount: number): string {
  return t(
    amount < 0 ? "people.panel.timeOff.adjust.takeAway" : "people.panel.timeOff.adjust.add",
    {
      days: formatDays(Math.abs(amount)),
    },
  );
}

/** The API's limit on one adjustment: a leap year's days. */
const MAX_ADJUSTMENT_DAYS = 366;

/** "you", the author's email, or "someone". */
function authorName(change: Pick<AllowanceChange, "author">, readerUserId: string): string {
  return change.author.userId === readerUserId
    ? t("people.panel.timeOff.history.you")
    : (change.author.email ?? t("people.panel.timeOff.history.someone"));
}

/** The card's figures in its order; bank holidays and used take from the days left. */
const FIGURES = [
  { field: "entitlementAfter", words: "people.panel.timeOff.history.allowance", takes: false },
  {
    field: "bankHolidaysAfter",
    words: "people.panel.timeOff.history.bankHolidaysTaken",
    takes: true,
  },
  { field: "usedAfter", words: "people.panel.timeOff.history.used", takes: true },
] as const satisfies readonly { field: FigureField; words: MessageKey; takes: boolean }[];

/** Adjustments, their reversals and bookings, whose title and amount say what one moved figure did. */
const TITLED_CAUSES = new Set<AllowanceChangeCause>([
  "ALLOWANCE_ADJUSTED",
  "ALLOWANCE_ADJUSTMENT_REVERSED",
  "TIME_OFF_BOOKED",
  "TIME_OFF_APPROVED",
  "TIME_OFF_CANCELLED",
]);

const BOOKING_TITLES = {
  TIME_OFF_BOOKED: "people.panel.timeOff.history.booked",
  TIME_OFF_APPROVED: "people.panel.timeOff.history.approved",
  TIME_OFF_CANCELLED: "people.panel.timeOff.history.cancelled",
} as const satisfies Partial<Record<AllowanceChangeCause, MessageKey>>;

const CAUSE_TITLES = {
  TIME_OFF_TURNED_ON: "people.panel.timeOff.history.timeOffTurnedOn",
  EMPLOYEE_ADDED: "people.panel.timeOff.history.employeeAdded",
  LEAVE_YEAR_STARTED: "people.panel.timeOff.history.leaveYearStarted",
  START_DATE_CHANGED: "people.panel.timeOff.history.startDateChanged",
  WORKING_PATTERN_CHANGED: "people.panel.timeOff.history.workingPatternChanged",
  TERMS_CHANGED: "people.panel.timeOff.history.termsChanged",
  TIME_OFF_RULES_CHANGED: "people.panel.timeOff.history.timeOffRulesChanged",
  DAILY_CHECK: "people.panel.timeOff.history.dailyCheck",
} as const satisfies Record<
  Exclude<
    AllowanceChangeCause,
    keyof typeof BOOKING_TITLES | "ALLOWANCE_ADJUSTED" | "ALLOWANCE_ADJUSTMENT_REVERSED"
  >,
  MessageKey
>;

const UNDATED_CAUSE_TITLES = {
  ...CAUSE_TITLES,
  START_DATE_CHANGED: "people.panel.timeOff.history.startDateCleared",
  WORKING_PATTERN_CHANGED: "people.panel.timeOff.history.workingPatternChangedUndated",
  TERMS_CHANGED: "people.panel.timeOff.history.termsChangedUndated",
  TIME_OFF_RULES_CHANGED: "people.panel.timeOff.history.timeOffRulesChangedUndated",
} as const satisfies Record<keyof typeof CAUSE_TITLES, MessageKey>;
