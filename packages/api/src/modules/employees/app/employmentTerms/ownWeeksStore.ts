import type { Tx } from "../../../../core/db";
import { workingPatternRepository } from "../../db";
import {
  type OwnStretch,
  ownStretchesOf,
  type PatternVersion,
  type PatternWeek,
} from "../../domain";

/** A person's own weeks from their assignments, and the published versions those use. */
export async function readOwnWeeks(
  tx: Tx,
  employeeId: string,
): Promise<{ weeks: OwnStretch<PatternWeek>[]; versions: PatternVersion[] }> {
  const repository = workingPatternRepository(tx);
  const assignments = await repository.findAssignments({ employeeIds: [employeeId] });
  const used = new Set(assignments.map(({ versionId }) => versionId));
  const versions = (await repository.findPatterns())
    .flatMap((pattern) => pattern.versions)
    .filter(({ id }) => used.has(id));
  const versionOf = (id: string) => versions.find((version) => version.id === id);
  return { weeks: ownStretchesOf(assignments, (id) => weekOf(versionOf(id))), versions };
}

/**
 * Gives the person one assignment per own week, in place of every assignment they had: to a
 * version they already use with the same week, else to a new published one.
 */
export async function saveOwnWeeks(
  tx: Tx,
  employeeId: string,
  versions: readonly PatternVersion[],
  weeks: readonly OwnStretch<PatternWeek>[],
): Promise<void> {
  const repository = workingPatternRepository(tx);
  for (const { id } of await repository.findAssignments({ employeeIds: [employeeId] })) {
    await repository.deleteAssignment(id);
  }
  const saved = [...versions];
  for (const { startDate, endDate, value: week } of weeks) {
    let version = saved.find((candidate) => isSameWeek(candidate, week));
    if (!version) {
      const workingPatternId = saved[0]?.workingPatternId ?? (await repository.insertPattern(null));
      const id = await repository.insertVersion(workingPatternId, {
        ...week,
        status: "published",
      });
      version = { id, workingPatternId, status: "published", termsId: null, revision: 1, ...week };
      saved.push(version);
    }
    await repository.insertAssignment({
      versionId: version.id,
      owner: { employeeId },
      startDate,
      endDate,
    });
  }
}

function isSameWeek(a: PatternWeek, b: PatternWeek): boolean {
  return (
    a.bankHolidayCalendar === b.bankHolidayCalendar &&
    a.minutes.every((minutes, day) => minutes === b.minutes[day])
  );
}

function weekOf(version: PatternWeek | undefined): PatternWeek | undefined {
  return version && { minutes: version.minutes, bankHolidayCalendar: version.bankHolidayCalendar };
}
