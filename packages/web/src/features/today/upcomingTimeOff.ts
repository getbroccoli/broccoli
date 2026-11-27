import type { TimeOffStatus } from "@/__generated__/graphql";

export type OwnTimeOff = {
  id: string;
  status: TimeOffStatus | null;
  startDate: string;
  endDate: string;
};

/** The person's own requested or approved time off that has not ended, soonest first. */
export function upcomingTimeOff<T extends OwnTimeOff>(requests: readonly T[], today: string): T[] {
  return requests
    .filter(
      ({ status, endDate }) =>
        (status === "REQUESTED" || status === "APPROVED") && endDate >= today,
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}
