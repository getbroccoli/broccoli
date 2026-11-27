import type { TimeOffDayPart, WhosOutDayKind } from "@/__generated__/graphql";
import { addDays } from "@/lib/calendarDay";

/** One day's piece of a booking's bar, with which ends are rounded. */
export type BarPart = {
  timeOffId: string;
  dayPart: TimeOffDayPart;
  roundStart: boolean;
  roundEnd: boolean;
};

/**
 * Each date's bar pieces for one person: a booked day shows only where the person was due to
 * work (kind WORKING_DAY), unless none of the time off's days in the range is one: then it keeps
 * them all, so it can still be opened. A bar's run is rounded wherever it starts or stops, so a
 * morning ends one and an afternoon starts one.
 */
export function barParts(whosOut: {
  days: readonly { date: string; kind: WhosOutDayKind }[];
  timeOff: readonly { id: string; days: readonly { date: string; dayPart: TimeOffDayPart }[] }[];
}): Map<string, BarPart[]> {
  const inRange = new Set(whosOut.days.map(({ date }) => date));
  const working = new Set(
    whosOut.days.filter(({ kind }) => kind === "WORKING_DAY").map(({ date }) => date),
  );
  const parts = new Map<string, BarPart[]>();
  for (const { id, days } of whosOut.timeOff) {
    const visible = days.filter(({ date }) => inRange.has(date));
    const worked = visible.filter(({ date }) => working.has(date));
    const shown = new Map(
      (worked.length > 0 ? worked : visible).map(({ date, dayPart }) => [date, dayPart]),
    );
    for (const [date, dayPart] of shown) {
      const before = shown.get(addDays(date, -1));
      const after = shown.get(addDays(date, 1));
      const part = {
        timeOffId: id,
        dayPart,
        roundStart: !before || dayPart === "AFTERNOON" || before === "MORNING",
        roundEnd: !after || dayPart === "MORNING" || after === "AFTERNOON",
      };
      parts.set(date, [...(parts.get(date) ?? []), part]);
    }
  }
  return parts;
}
