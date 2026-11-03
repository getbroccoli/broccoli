import { addDays, type CalendarDate } from "../../../utils";

/** A dated row naming a policy: an assignment, or terms' link for one type. */
export interface DatedPolicyRow {
  timeOffTypeId: string;
  timeOffPolicyId: string;
  effectiveFrom: CalendarDate | null;
  effectiveUntil: CalendarDate | null;
}

/** A person's terms over a period; null dates are open. */
export interface DatedMembership {
  termsId: string;
  effectiveFrom: CalendarDate | null;
  effectiveUntil: CalendarDate | null;
}

/** What decides which policy applies to one person. */
export interface PolicyTimeline {
  assignments: readonly DatedPolicyRow[];
  memberships: readonly DatedMembership[];
  /** Each terms' links, by terms id. */
  termsLinks: ReadonlyMap<string, readonly DatedPolicyRow[]>;
}

/**
 * The policy that applies for a type on a date: the person's assignment, else their terms' link,
 * else none. Employment is not checked here: the allowance target keeps only employed days.
 */
export function policyIdOn(
  timeline: PolicyTimeline,
  timeOffTypeId: string,
  date: CalendarDate,
): string | null {
  const ofType = (row: DatedPolicyRow) => row.timeOffTypeId === timeOffTypeId && covers(row, date);
  const assigned = timeline.assignments.find(ofType);
  if (assigned) {
    return assigned.timeOffPolicyId;
  }
  const membership = timeline.memberships.find((row) => covers(row, date));
  const link = membership && timeline.termsLinks.get(membership.termsId)?.find(ofType);
  return link?.timeOffPolicyId ?? null;
}

/** The policies that apply for a type from `from` to `until`, oldest first, as dated stretches. */
export function policyStretches(
  timeline: PolicyTimeline,
  timeOffTypeId: string,
  from: CalendarDate,
  until: CalendarDate,
): { timeOffPolicyId: string; effectiveFrom: CalendarDate; effectiveUntil: CalendarDate }[] {
  const rows = [
    ...timeline.assignments,
    ...timeline.memberships,
    ...[...timeline.termsLinks.values()].flat(),
  ];
  const changeDates = rows
    .flatMap(({ effectiveFrom, effectiveUntil }) => [
      effectiveFrom,
      effectiveUntil && addDays(effectiveUntil, 1),
    ])
    .filter((date): date is CalendarDate => date !== null && date > from && date <= until);
  const starts = [from, ...new Set(changeDates)].toSorted();
  // Each date where the policy differs from the day before starts a stretch.
  const policyChanges = starts
    .map((start) => ({ start, timeOffPolicyId: policyIdOn(timeline, timeOffTypeId, start) }))
    .filter((change, index, all) => change.timeOffPolicyId !== all[index - 1]?.timeOffPolicyId);
  return policyChanges.flatMap(({ start, timeOffPolicyId }, index) => {
    const next = policyChanges[index + 1];
    return timeOffPolicyId
      ? [
          {
            timeOffPolicyId,
            effectiveFrom: start,
            effectiveUntil: next ? addDays(next.start, -1) : until,
          },
        ]
      : [];
  });
}

function covers(
  row: { effectiveFrom: CalendarDate | null; effectiveUntil: CalendarDate | null },
  date: CalendarDate,
): boolean {
  return (
    (row.effectiveFrom === null || row.effectiveFrom <= date) &&
    (row.effectiveUntil === null || date <= row.effectiveUntil)
  );
}
