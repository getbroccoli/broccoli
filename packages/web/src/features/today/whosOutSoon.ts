import type { TimeOffStatus } from "@/__generated__/graphql";

export type OutTimeOff = {
  id: string;
  /** Null for a viewer who may not read the person's time off; whosOut then only returns approved time off. */
  status: TimeOffStatus | null;
  startDate: string;
  endDate: string;
  /** The booked dates, oldest first; a booking skips non-working days. */
  days: readonly { date: string }[];
};
export type OutPerson = {
  id: string;
  firstName: string;
  lastName: string;
  whosOut: { timeOff: readonly OutTimeOff[] };
};
export type Absence<P extends OutPerson> = { person: P; timeOff: P["whosOut"]["timeOff"][number] };

/** Others' approved time off: booked today, and booked later in the range, each by its next booked date then name. */
export function whosOutSoon<P extends OutPerson>(
  people: readonly P[],
  today: string,
): { today: Absence<P>[]; upcoming: Absence<P>[] } {
  const dated = people
    .flatMap((person) =>
      person.whosOut.timeOff.filter(isApproved).flatMap((timeOff) => {
        const next = nextBookedDay(timeOff, today);
        return next ? [{ next, absence: { person, timeOff } }] : [];
      }),
    )
    .sort(
      (a, b) =>
        a.next.localeCompare(b.next) ||
        fullName(a.absence.person).localeCompare(fullName(b.absence.person)),
    );
  return {
    today: dated.filter(({ next }) => next === today).map(({ absence }) => absence),
    upcoming: dated.filter(({ next }) => next > today).map(({ absence }) => absence),
  };
}

/** Approved, or hidden from a viewer who may not read it, which whosOut returns only once approved. */
function isApproved({ status }: OutTimeOff): boolean {
  return status === "APPROVED" || status === null;
}

function nextBookedDay(timeOff: OutTimeOff, today: string): string | undefined {
  return timeOff.days.find(({ date }) => date >= today)?.date;
}

function fullName({ firstName, lastName }: { firstName: string; lastName: string }): string {
  return `${firstName} ${lastName}`;
}
