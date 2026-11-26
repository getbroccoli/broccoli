import Big from "big.js";

import type { HistoryAuthor } from "../../../core/records";
import type { CalendarDate } from "../../../utils";
import type { AllowanceCause } from "./allowanceCause";
import { type LedgerLineKind, timeOffFigures } from "./timeOffFigures";

/** Why a balance changed: a cause of the engine's lines, or someone adjusting it. */
export type AllowanceChangeCause = Lowercase<AllowanceCause["kind"]> | "allowance_adjusted";

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
  balanceAfter: number;
  /** The change's lines summed by kind; kinds adding up to 0 are left out. */
  parts: { kind: LedgerLineKind; amount: number }[];
  author: HistoryAuthor;
  /** The adjustment's comment. */
  comment: string | null;
}

/**
 * A balance's changes, newest first: the lines each change wrote in one transaction, with the
 * remaining figure after it, worked out as the panel works it out so the newest equals Remaining.
 */
export function allowanceHistory(lines: readonly StoredLedgerLine[]): AllowanceChange[] {
  const oldestFirst = [...lines].sort(byTimeThenId);
  const groups = Map.groupBy(oldestFirst, changeKeyOf);
  const sums = new Map<LedgerLineKind, Big>();
  let previousBalance = 0;
  const changes: AllowanceChange[] = [];
  for (const group of groups.values()) {
    for (const { kind, amount } of group) {
      sums.set(kind, (sums.get(kind) ?? Big(0)).plus(amount));
    }
    const balanceAfter = timeOffFigures(
      [...sums].map(([kind, sum]) => ({ kind, amount: sum.toNumber() })),
    ).remaining;
    const change = toChange(group, balanceAfter, previousBalance);
    previousBalance = balanceAfter;
    if (change.amount !== 0 || change.parts.length > 0) {
      changes.push(change);
    }
  }
  return changes.reverse();
}

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
  balanceAfter: number,
  previousBalance: number,
): AllowanceChange {
  const first = group[0]!;
  const adjustment = group.find(({ kind }) => kind === "manual_adjustment");
  return {
    recordedAt: first.createdAt,
    cause: first.causeKind,
    causeDate: causeDateOf(first),
    bookedDays: bookedDaysOf(group),
    amount: Big(balanceAfter).minus(previousBalance).toNumber() + 0,
    balanceAfter,
    parts: partsOf(group),
    author: (adjustment ?? first).author,
    comment: adjustment?.reason ?? null,
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

function partsOf(group: readonly StoredLedgerLine[]): AllowanceChange["parts"] {
  const byKind = Map.groupBy(group, ({ kind }) => kind);
  return [...byKind].flatMap(([kind, lines]) => {
    const amount = lines
      .reduce((sum, line) => sum.plus(line.amount), Big(0))
      .round(2)
      .toNumber();
    return amount === 0 ? [] : [{ kind, amount: amount + 0 }];
  });
}
