import { addDays, type CalendarDate } from "../../../utils";

/** A dated row naming a policy: an assignment, or a group's link for one type. */
export interface DatedPolicyRow {
  timeOffTypeId: string;
  timeOffPolicyId: string;
  effectiveFrom: CalendarDate | null;
  effectiveUntil: CalendarDate | null;
}

/** A person's group over a period; null dates are open. */
export interface DatedMembership {
  policyGroupId: string;
  effectiveFrom: CalendarDate | null;
  effectiveUntil: CalendarDate | null;
}

/** What decides which policy applies to one person. */
export interface PolicyTimeline {
  assignments: readonly DatedPolicyRow[];
  memberships: readonly DatedMembership[];
  /** Each group's links, by group id. */
  groupLinks: ReadonlyMap<string, readonly DatedPolicyRow[]>;
}

/**
 * The policy that applies for a type on a date: the person's assignment, else their group's link,
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
  const link = membership && timeline.groupLinks.get(membership.policyGroupId)?.find(ofType);
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
    ...[...timeline.groupLinks.values()].flat(),
  ];
  const changes = rows
    .flatMap(({ effectiveFrom, effectiveUntil }) => [
      effectiveFrom,
      effectiveUntil && addDays(effectiveUntil, 1),
    ])
    .filter((date): date is CalendarDate => date !== null && date > from && date <= until);
  const starts = [from, ...new Set(changes)].toSorted();
  const stretches: ReturnType<typeof policyStretches> = [];
  starts.forEach((start, index) => {
    const end = index + 1 < starts.length ? addDays(starts[index + 1]!, -1) : until;
    const timeOffPolicyId = policyIdOn(timeline, timeOffTypeId, start);
    const last = stretches.at(-1);
    if (
      last &&
      last.timeOffPolicyId === timeOffPolicyId &&
      last.effectiveUntil === addDays(start, -1)
    ) {
      last.effectiveUntil = end;
    } else if (timeOffPolicyId) {
      stretches.push({ timeOffPolicyId, effectiveFrom: start, effectiveUntil: end });
    }
  });
  return stretches;
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
