import { fortnightFrom } from "./fortnight";

export type Starter = { id: string; firstName: string; lastName: string; startDate: string | null };
export type ComingUpEvent<P extends Starter> =
  | { kind: "STARTS"; date: string; person: P }
  | { kind: "ANNIVERSARY"; date: string; years: number; person: P };

/** People starting and work anniversaries from today to 13 days ahead, by date then name. */
export function comingUp<P extends Starter>(
  people: readonly P[],
  today: string,
): ComingUpEvent<P>[] {
  const { from, until } = fortnightFrom(today);
  const within = (date: string) => from <= date && date <= until;
  return people
    .flatMap((person): ComingUpEvent<P>[] => {
      const start = person.startDate;
      if (!start) return [];
      if (start >= from) return within(start) ? [{ kind: "STARTS", date: start, person }] : [];
      return nextAnniversaries(start, from)
        .filter(({ date, years }) => years >= 1 && within(date))
        .map(({ date, years }) => ({ kind: "ANNIVERSARY", date, years, person }));
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        `${a.person.firstName} ${a.person.lastName}`.localeCompare(
          `${b.person.firstName} ${b.person.lastName}`,
        ),
    );
}

/** The anniversaries of `start` in the year of `from` and the next, as a fortnight may cross New Year. */
function nextAnniversaries(start: string, from: string): { date: string; years: number }[] {
  const startYear = Number(start.slice(0, 4));
  const year = Number(from.slice(0, 4));
  return [year, year + 1].map((each) => ({
    date: anniversaryIn(start, each),
    years: each - startYear,
  }));
}

/** The day `start` comes round in `year`; a 29 February start is kept on 28 February in other years. */
function anniversaryIn(start: string, year: number): string {
  const monthDay = start.slice(5);
  const day = monthDay === "02-29" && !isLeapYear(year) ? "02-28" : monthDay;
  return `${String(year).padStart(4, "0")}-${day}`;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
