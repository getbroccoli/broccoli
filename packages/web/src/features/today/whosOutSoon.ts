import type { TimeOffStatus } from "@/__generated__/graphql";

export type OutTimeOff = {
  id: string;
  status: TimeOffStatus | null;
  startDate: string;
  endDate: string;
};
export type OutPerson = {
  id: string;
  firstName: string;
  lastName: string;
  whosOut: { timeOff: readonly OutTimeOff[] };
};
export type Absence<P extends OutPerson> = { person: P; timeOff: P["whosOut"]["timeOff"][number] };

/** Others' approved time off: under way today, and starting later, each by start date then name. */
export function whosOutSoon<P extends OutPerson>(
  people: readonly P[],
  today: string,
): { today: Absence<P>[]; upcoming: Absence<P>[] } {
  const absences = people
    .flatMap((person) => person.whosOut.timeOff.map((timeOff) => ({ person, timeOff })))
    .filter(({ timeOff }) => timeOff.status === "APPROVED" && timeOff.endDate >= today)
    .sort(byStartThenName);
  return {
    today: absences.filter(({ timeOff }) => timeOff.startDate <= today),
    upcoming: absences.filter(({ timeOff }) => timeOff.startDate > today),
  };
}

function byStartThenName(a: Absence<OutPerson>, b: Absence<OutPerson>): number {
  return (
    a.timeOff.startDate.localeCompare(b.timeOff.startDate) ||
    fullName(a.person).localeCompare(fullName(b.person))
  );
}

function fullName({ firstName, lastName }: { firstName: string; lastName: string }): string {
  return `${firstName} ${lastName}`;
}
