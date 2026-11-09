import type { Tx } from "../../../../core/db";
import { addDays, type CalendarDate } from "../../../../utils";
import { workingPatternRepository } from "../../db";
import { type OwnWeek, ownWeeksOf } from "../../domain";

/**
 * A person's own weeks from their assignments, and their personal pattern's id; null until they
 * first had an own week.
 */
export async function readOwnWeeks(
  tx: Tx,
  employeeId: string,
): Promise<{ weeks: OwnWeek[]; workingPatternId: string | null }> {
  const repository = workingPatternRepository(tx);
  const assignments = (await repository.findAssignments([employeeId])).get(employeeId) ?? [];
  const name = ownPatternName(employeeId);
  const patterns = await repository.findPatterns({
    ids: assignments.map(({ workingPatternId }) => workingPatternId),
    name,
  });
  const versionsOf = (id: string) => patterns.find((pattern) => pattern.id === id)?.versions ?? [];
  const own = patterns.find((pattern) => !pattern.termsId && pattern.name === name);
  return { weeks: ownWeeksOf(assignments, versionsOf), workingPatternId: own?.id ?? null };
}

/**
 * Stores the person's own weeks on their personal pattern: one version per stretch, from the
 * beginning and without gaps, and one assignment per run of back-to-back stretches, in place of
 * every assignment they had. Returns the pattern's id; null while they never had an own week.
 */
export async function saveOwnWeeks(
  tx: Tx,
  employeeId: string,
  workingPatternId: string | null,
  weeks: readonly OwnWeek[],
): Promise<string | null> {
  const repository = workingPatternRepository(tx);
  for (const assignment of (await repository.findAssignments([employeeId])).get(employeeId) ?? []) {
    await repository.deleteAssignment(assignment.id);
  }
  const [first, ...rest] = weeks;
  if (!first) return workingPatternId;
  const id =
    workingPatternId ??
    (await repository.insertPattern({ name: ownPatternName(employeeId) }, first.week));
  await repository.replaceVersions(id, first.week);
  if (rest.length > 0) {
    const [pattern] = await repository.findPatterns({
      ids: [id],
      name: ownPatternName(employeeId),
    });
    await repository.endVersion(pattern!.versions[0]!.id, addDays(rest[0]!.startDate!, -1));
  }
  for (const [index, stretch] of rest.entries()) {
    const next = rest[index + 1];
    await repository.insertVersion(id, {
      ...stretch.week,
      startDate: stretch.startDate,
      endDate: next ? addDays(next.startDate!, -1) : null,
    });
  }
  for (const run of runsOf(weeks)) {
    await repository.insertAssignment(employeeId, { workingPatternId: id, ...run });
  }
  return id;
}

/** Back-to-back stretches joined into the dates one assignment covers. */
function runsOf(
  weeks: readonly OwnWeek[],
): { startDate: CalendarDate; endDate: CalendarDate | null }[] {
  const runs: { startDate: CalendarDate; endDate: CalendarDate | null }[] = [];
  for (const { startDate, endDate } of weeks) {
    const last = runs.at(-1);
    if (last && last.endDate !== null && startDate === addDays(last.endDate, 1)) {
      last.endDate = endDate;
    } else {
      // Every assignment starts on a date, so every stretch read from them does too.
      runs.push({ startDate: startDate!, endDate });
    }
  }
  return runs;
}

/** The personal pattern's name, unique per person and never shown. */
function ownPatternName(employeeId: string): string {
  return `own:${employeeId}`;
}
