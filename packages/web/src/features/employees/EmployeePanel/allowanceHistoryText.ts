import type {
  AllowanceChangeCause,
  AllowanceHistoryQuery,
  AllowanceLineKind,
} from "@/__generated__/graphql";
import { type MessageKey, t } from "@/i18n";
import { bookingDates, dayMonthYear } from "@/lib/formatDate";
import { formatDays } from "@/lib/formatDays";

/** One change to a balance as the history query reads it. */
export type AllowanceChange = NonNullable<
  NonNullable<NonNullable<AllowanceHistoryQuery["employee"]>["timeOffTypes"]>[number]["history"]
>[number];

/** What happened, in words: "Booked 7–9 Dec 2026", "Adjusted by you". */
export function changeTitle(change: AllowanceChange, readerUserId: string): string {
  switch (change.cause) {
    case "ALLOWANCE_ADJUSTED":
      return t("people.panel.timeOff.history.adjusted", {
        author:
          change.author.userId === readerUserId
            ? t("people.panel.timeOff.history.you")
            : (change.author.email ?? t("people.panel.timeOff.history.someone")),
      });
    case "TIME_OFF_BOOKED":
    case "TIME_OFF_CANCELLED":
      return t(BOOKING_TITLES[change.cause], {
        dates: bookingDates(change.firstBookedDay ?? "", change.lastBookedDay ?? ""),
      });
    default:
      return t(CAUSE_TITLES[change.cause], {
        date: change.causeDate ? dayMonthYear(change.causeDate) : "",
      });
  }
}

/** What a change is made of, signed: "+28 granted, −8 bank holidays"; null where the title says it. */
export function partsLine(change: Pick<AllowanceChange, "cause" | "parts">): string | null {
  if (SELF_EXPLAINING_CAUSES.has(change.cause)) {
    return null;
  }
  return change.parts
    .map(({ kind, amount }) => `${signedDays(amount)} ${t(PART_WORDS[kind])}`)
    .join(", ");
}

/** Days with their sign: "+2", "−2.5". */
export function signedDays(amount: number): string {
  return `${amount < 0 ? "−" : "+"}${dayCount.format(Math.abs(amount))}`;
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

const dayCount = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

const SELF_EXPLAINING_CAUSES = new Set<AllowanceChangeCause>([
  "ALLOWANCE_ADJUSTED",
  "TIME_OFF_BOOKED",
  "TIME_OFF_CANCELLED",
]);

const BOOKING_TITLES = {
  TIME_OFF_BOOKED: "people.panel.timeOff.history.booked",
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
  Exclude<AllowanceChangeCause, keyof typeof BOOKING_TITLES | "ALLOWANCE_ADJUSTED">,
  MessageKey
>;

const PART_WORDS = {
  ENTITLEMENT_GRANT: "people.panel.timeOff.history.part.granted",
  BANK_HOLIDAY_ALLOWANCE_GRANT: "people.panel.timeOff.history.part.bankHolidaysGranted",
  BANK_HOLIDAY_TAKEN: "people.panel.timeOff.history.part.bankHolidays",
  TIME_OFF_BOOKED: "people.panel.timeOff.history.part.booked",
  MANUAL_ADJUSTMENT: "people.panel.timeOff.history.part.adjusted",
  ROUNDING_UP_TO_HALF_DAY: "people.panel.timeOff.history.part.rounding",
} as const satisfies Record<AllowanceLineKind, MessageKey>;
