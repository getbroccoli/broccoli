import Big from "big.js";

import type { HistoryAuthor } from "../../../core/records";
import type { CalendarDate } from "../../../utils";
import type { AllowanceCause } from "./allowanceCause";
import { type LedgerLineKind, type TimeOffFigures, timeOffFigures } from "./timeOffFigures";

/** Why a balance changed: a cause of the engine's lines, or someone adjusting it. */
export type AllowanceChangeCause =
  Lowercase<AllowanceCause["kind"]> | "allowance_adjusted" | "allowance_adjustment_reversed";

/** A ledger line as stored, for the history. */
export interface StoredLedgerLine {
  /** A uuidv7, so ids sort by time. */
  id: string;
  kind: LedgerLineKind;
  /** Days as the database's decimal text. */
  amount: string;
  effectiveDate: CalendarDate;
  causeKind: AllowanceChangeCause;
  causeRef: string | null;
  reason: string | null;
  author: HistoryAuthor;
  /** The transaction's time, shared by every line one change writes. */
  createdAt: Date;
}

/** One change to a balance: the lines one booking, adjustment or recalculation wrote. */
export interface AllowanceChange {
  recordedAt: Date;
  cause: AllowanceChangeCause;
  /** The date the cause names, such as a new start date or the date a change applies from. */
  causeDate: CalendarDate | null;
  /** The first and last day the change's booked lines fall on. */
  bookedDays: { first: CalendarDate; last: CalendarDate } | null;
  /** Days added (positive) or taken (negative): the balance after less the one before. */
  amount: number;
  /** The figures after the change, as the card shows them, so the newest equals the card's. */
  entitlementAfter: number;
  bankHolidaysAfter: number;
  usedAfter: number;
  balanceAfter: number;
  author: HistoryAuthor;
  /** The adjustment's comment, or the reversal's reason. */
  comment: string | null;
  /** The adjustment's or reversal's line id; null for other changes. */
  adjustmentId: string | null;
  /** Whether a reversal undid this adjustment. */
  reversed: boolean;
}

/**
 * A balance's changes, newest first: the lines each change wrote in one transaction, with the
 * remaining figure after it, worked out as the panel works it out so the newest equals Remaining.
 */
export function allowanceHistory(lines: readonly StoredLedgerLine[]): AllowanceChange[] {
  const oldestFirst = [...lines].sort(byTimeThenId);
  const reversedIds = new Set(
    lines.flatMap(({ causeKind, causeRef }) =>
      causeKind === "allowance_adjustment_reversed" && causeRef ? [causeRef] : [],
    ),
  );
  const groups = Map.groupBy(oldestFirst, changeKeyOf);
  const sums = new Map<LedgerLineKind, Big>();
  let previous = timeOffFigures([]);
  const changes: AllowanceChange[] = [];
  for (const group of groups.values()) {
    for (const { kind, amount } of group) {
      sums.set(kind, (sums.get(kind) ?? Big(0)).plus(amount));
    }
    const after = timeOffFigures(
      [...sums].map(([kind, sum]) => ({ kind, amount: sum.toNumber() })),
    );
    if (FIGURES.some((figure) => after[figure] !== previous[figure])) {
      changes.push(toChange(group, after, previous.remaining, reversedIds));
    }
    previous = after;
  }
  return changes.reverse();
}

/** A change that moves none of these is left out; remaining follows from them. */
const FIGURES = ["entitlement", "bankHolidays", "used"] as const;

/** Causes whose reference is the date they apply from, or `<id>:<date>` for rules changes. */
const DATED_CAUSES = new Set<AllowanceChangeCause>([
  "start_date_changed",
  "working_pattern_changed",
  "terms_changed",
  "time_off_rules_changed",
]);

function byTimeThenId(a: StoredLedgerLine, b: StoredLedgerLine): number {
  return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
}

/** One transaction's lines of one cause; each adjustment is a change of its own. */
function changeKeyOf({ id, kind, createdAt, causeKind, causeRef }: StoredLedgerLine): string {
  return kind === "manual_adjustment"
    ? id
    : JSON.stringify([createdAt.getTime(), causeKind, causeRef]);
}

function toChange(
  group: readonly StoredLedgerLine[],
  after: TimeOffFigures,
  previousBalance: number,
  reversedIds: ReadonlySet<string>,
): AllowanceChange {
  const first = group[0]!;
  // An adjustment or reversal is a change of its own, so its line is the first.
  const adjustment = first.kind === "manual_adjustment";
  return {
    recordedAt: first.createdAt,
    cause: first.causeKind,
    causeDate: causeDateOf(first),
    bookedDays: bookedDaysOf(group),
    amount: Big(after.remaining).minus(previousBalance).toNumber() + 0,
    entitlementAfter: after.entitlement,
    bankHolidaysAfter: after.bankHolidays,
    usedAfter: after.used,
    balanceAfter: after.remaining,
    author: first.author,
    comment: adjustment ? first.reason : null,
    adjustmentId: adjustment ? first.id : null,
    reversed: adjustment && reversedIds.has(first.id),
  };
}

function causeDateOf({ causeKind, causeRef }: StoredLedgerLine): CalendarDate | null {
  if (!DATED_CAUSES.has(causeKind) || causeRef === null) {
    return null;
  }
  return causeRef.split(":").at(-1) as CalendarDate;
}

function bookedDaysOf(group: readonly StoredLedgerLine[]): AllowanceChange["bookedDays"] {
  const days = group
    .filter(({ kind }) => kind === "time_off_booked")
    .map(({ effectiveDate }) => effectiveDate)
    .sort();
  return days.length === 0 ? null : { first: days[0]!, last: days.at(-1)! };
}
