import type {
  AllowanceChangeCause,
  AllowanceHistoryQuery,
  AllowanceLineKind,
} from "@/__generated__/graphql";
import { type MessageKey, t } from "@/i18n";
import { bookingDates, dayMonthYear } from "@/lib/formatDate";
import { formatDayCount, formatDays } from "@/lib/formatDays";

/** One change to a balance as the history query reads it. */
export type AllowanceChange = NonNullable<
  NonNullable<NonNullable<AllowanceHistoryQuery["employee"]>["timeOffTypes"]>[number]["history"]
>[number];

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
) {
  const values = {
    days: formatDays(Math.abs(change.amount)),
    date: recordedDay.format(new Date(change.recordedAt)),
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

/** What a change is made of, signed: "+28 granted, −8 bank holidays"; null where the title says it. */
export function partsLine(change: Pick<AllowanceChange, "cause" | "parts">): string | null {
  if (titleSaysItAll(change)) {
    return null;
  }
  return change.parts
    .map(({ kind, amount }) => `${signedDays(amount)} ${t(PART_WORDS[kind])}`)
    .join(", ");
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

/** "27 Nov", the day the instant falls on in London, where the company's days are. */
const recordedDay = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/London",
});

/** An adjustment or its reversal, or a booking or cancellation that only moved booked days. */
function titleSaysItAll({ cause, parts }: Pick<AllowanceChange, "cause" | "parts">): boolean {
  return (
    cause === "ALLOWANCE_ADJUSTED" ||
    cause === "ALLOWANCE_ADJUSTMENT_REVERSED" ||
    (BOOKING_CAUSES.has(cause) && parts.every(({ kind }) => kind === "TIME_OFF_BOOKED"))
  );
}

const BOOKING_CAUSES = new Set<AllowanceChangeCause>([
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

const PART_WORDS = {
  ENTITLEMENT_GRANT: "people.panel.timeOff.history.part.granted",
  BANK_HOLIDAY_ALLOWANCE_GRANT: "people.panel.timeOff.history.part.bankHolidaysGranted",
  BANK_HOLIDAY_TAKEN: "people.panel.timeOff.history.part.bankHolidays",
  TIME_OFF_BOOKED: "people.panel.timeOff.history.part.booked",
  MANUAL_ADJUSTMENT: "people.panel.timeOff.history.part.adjusted",
  ROUNDING_UP_TO_HALF_DAY: "people.panel.timeOff.history.part.rounding",
} as const satisfies Record<AllowanceLineKind, MessageKey>;
