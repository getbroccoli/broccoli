import type { Tx } from "../../../core/db";
import { termsRepository, workingPatternRepository } from "../db";
import { type PatternWeek, SETUP_START_DATE, STANDARD_WEEKS } from "../domain";

/** A new pattern on `week`, published and given to the terms from the setup start; returns its id. */
export async function giveWeek(tx: Tx, termsId: string, week: PatternWeek): Promise<string> {
  const patternId = await workingPatternRepository(tx).insertPattern(null);
  await giveVersion(tx, termsId, patternId, week);
  return patternId;
}

/**
 * Puts the terms on `week` from the setup start instead of what they worked, as a new version of
 * their own pattern; the version it replaces goes. Terms already working only that week keep it.
 */
export async function changeWeek(tx: Tx, termsId: string, week: PatternWeek): Promise<void> {
  const patterns = workingPatternRepository(tx);
  const [only, ...others] = await patterns.findAssignments({ termsIds: [termsId] });
  const version = (await patterns.findPatterns())
    .flatMap(({ versions }) => versions)
    .find(({ id }) => id === only!.versionId)!;
  const isOnlyWeek =
    others.length === 0 &&
    only!.startDate === SETUP_START_DATE &&
    only!.endDate === null &&
    version.bankHolidayCalendar === week.bankHolidayCalendar &&
    version.minutes.join() === week.minutes.join();
  if (isOnlyWeek) {
    return;
  }
  await patterns.deleteTermsAssignments(termsId);
  if ((await patterns.findAssignmentsOfVersions([version.id])).length === 0) {
    await patterns.deleteVersion(version.id);
  }
  await giveVersion(tx, termsId, version.workingPatternId, week);
}

/** A new published version of the pattern on `week`, given to the terms from the setup start. */
async function giveVersion(
  tx: Tx,
  termsId: string,
  workingPatternId: string,
  week: PatternWeek,
): Promise<void> {
  const patterns = workingPatternRepository(tx);
  const versionId = await patterns.insertVersion(workingPatternId, {
    ...week,
    status: "published",
  });
  await patterns.insertAssignment({
    versionId,
    owner: { termsId },
    startDate: SETUP_START_DATE,
    endDate: null,
  });
}

/**
 * Puts the default terms back on the seeded week, Monday to Friday, England and Wales, and deletes
 * every other pattern: nobody else may have one any more.
 */
export async function resetDefaultPattern(tx: Tx): Promise<void> {
  const patterns = workingPatternRepository(tx);
  const defaultTermsId = await termsRepository(tx).findDefaultTermsId();
  await patterns.deleteTermsAssignments(defaultTermsId);
  await patterns.deleteUnassignedPatterns();
  await giveWeek(tx, defaultTermsId, {
    ...STANDARD_WEEKS.monday_to_friday_7_5_hours,
    bankHolidayCalendar: "england_and_wales",
  });
}
