import { shortDate, versionOn } from "@/features/termsDisplay";
import { type MessageKey, t } from "@/i18n";

type Source = "FROM_THEIR_TERMS" | "THEIR_OWN";
type Version = { source: Source; startDate: string; endDate?: string | null };
type Person = { firstName: string; lastName: string };

/** A person the preview would move, as they would be after it from its date on. */
type Move = {
  employee: Person;
  startDate: string;
  employmentTerms: {
    periods: readonly { termsName: string; startDate?: string | null }[];
    workingWeek: readonly Version[];
    timeOff?: readonly { versions: readonly Version[] }[] | null;
  };
};

type Skip = { employee: Person; reason: "ALREADY_ON_TERMS" | "LEFT_BEFORE_DATE" };

/** Who a bulk move reaches and who it leaves or moves otherwise, by name. */
export interface BulkGroups {
  moving: number;
  alreadyOn: string[];
  startLater: string[];
  left: string[];
  keepOwn: string[];
  /** "Jo Clarke moves to Northern Ireland on 1 Feb 2027". */
  laterMoves: string[];
}

/** Up to three names, then "and 2 more": "A, B and C", "A, B, C and 2 more". */
export function peopleList(names: readonly string[]): string {
  if (names.length > 3) {
    return t("changeTerms.bulk.more", {
      names: names.slice(0, 3).join(", "),
      count: String(names.length - 3),
    });
  }
  if (names.length === 1) return names[0]!;
  return t("changeTerms.and", { list: names.slice(0, -1).join(", "), last: names.at(-1)! });
}

/** The preview's answer sorted into who moves and why others don't move as asked. */
export function bulkGroups({
  moves,
  skipped,
  startDate,
}: {
  moves: readonly Move[];
  skipped: readonly Skip[];
  startDate: string;
}): BulkGroups {
  const skippedFor = (reason: Skip["reason"]) =>
    skipped.filter((skip) => skip.reason === reason).map(({ employee }) => nameOf(employee));
  return {
    moving: moves.length,
    alreadyOn: skippedFor("ALREADY_ON_TERMS"),
    left: skippedFor("LEFT_BEFORE_DATE"),
    startLater: moves.filter((move) => move.startDate > startDate).map(personOf),
    keepOwn: moves.filter(keepsOwn).map(personOf),
    laterMoves: moves.flatMap((move) => {
      const later = move.employmentTerms.periods.find(
        (period) => period.startDate != null && period.startDate > move.startDate,
      );
      return later
        ? [
            t("changeTerms.bulk.laterMove", {
              name: personOf(move),
              terms: later.termsName,
              date: shortDate(later.startDate!),
            }),
          ]
        : [];
    }),
  };
}

/** The quiet lines under the form, only those that apply. */
export function bulkLines({
  termsName,
  startDate,
  groups,
}: {
  termsName: string;
  startDate: string;
  groups: BulkGroups;
}): string[] {
  const date = shortDate(startDate);
  const line = (names: string[], key: MessageKey) =>
    names.length > 0 ? [t(key, { terms: termsName, date, names: peopleList(names) })] : [];
  return [
    ...line(groups.alreadyOn, "changeTerms.bulk.alreadyOn"),
    ...line(groups.startLater, "changeTerms.bulk.startLater"),
    ...line(groups.left, "changeTerms.bulk.left"),
    ...line(groups.keepOwn, "changeTerms.bulk.keepOwn"),
    ...line(groups.laterMoves, "changeTerms.bulk.laterMoves"),
  ];
}

/** "Change terms for 6 people". */
export function bulkTitle(count: number): string {
  return t("changeTerms.bulk.title", { people: peopleCount(count) });
}

/** What saving does: "Saving moves 4 people to Scotland from 1 Dec 2026.", or that nobody moves. */
export function bulkSaveLine({
  count,
  termsName,
  startDate,
}: {
  count: number;
  termsName: string;
  startDate: string;
}): string {
  const values = { people: peopleCount(count), terms: termsName, date: shortDate(startDate) };
  return t(count === 0 ? "changeTerms.bulk.nobody" : "changeTerms.bulk.saveLine", values);
}

/**
 * The toast once saved: a move still to come, or one that applies already; only who moved when
 * some move from a later start.
 */
export function bulkSavedToast({
  movedFrom,
  termsName,
  startDate,
  today,
}: {
  /** Each moved person's date. */
  movedFrom: readonly string[];
  termsName: string;
  startDate: string;
  today: string;
}): string {
  const count = movedFrom.length;
  const values = { people: peopleCount(count), terms: termsName, date: shortDate(startDate) };
  if (movedFrom.some((date) => date !== startDate)) {
    return t("changeTerms.bulk.moved", values);
  }
  const one = count === 1;
  if (startDate > today) {
    return t(one ? "changeTerms.bulk.movesOn" : "changeTerms.bulk.moveOn", values);
  }
  return t(one ? "changeTerms.bulk.isOn" : "changeTerms.bulk.areOn", values);
}

function peopleCount(count: number): string {
  return count === 1
    ? t("changeTerms.bulk.person")
    : t("changeTerms.bulk.people", { count: String(count) });
}

function keepsOwn({ startDate, employmentTerms: { workingWeek, timeOff } }: Move): boolean {
  const own = (versions: readonly Version[]) =>
    versionOn(versions, startDate)?.source === "THEIR_OWN";
  return own(workingWeek) || (timeOff ?? []).some(({ versions }) => own(versions));
}

function personOf({ employee }: Move): string {
  return nameOf(employee);
}

function nameOf({ firstName, lastName }: Person): string {
  return `${firstName} ${lastName}`;
}
