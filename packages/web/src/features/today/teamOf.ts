export type TeamMember = { id: string; managerId: string | null };

/** The viewer's team: their manager, everyone sharing that manager, and their direct reports; never the viewer. */
export function teamOf(people: readonly TeamMember[], viewerId: string): Set<string> {
  const managerId = people.find(({ id }) => id === viewerId)?.managerId ?? null;
  const team = people
    .filter(
      (person) =>
        person.managerId === viewerId ||
        (managerId !== null && (person.id === managerId || person.managerId === managerId)),
    )
    .map(({ id }) => id);
  return new Set(team.filter((id) => id !== viewerId));
}
