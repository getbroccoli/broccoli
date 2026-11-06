import type { Orm } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import { termsRepository, workingPatternRepository } from "../db";
import type { PatternVersion, Terms } from "../domain";

/** A set of terms as Settings shows it on a date. */
export interface TermsOverview extends Terms {
  /** People on the terms that day. */
  peopleCount: number;
  /** The terms' pattern versions covering that day or later, oldest first: the day's, then planned ones. */
  workingWeek: PatternVersion[];
}

/** The terms among `termsIds`, or every set without, as they are on `date`; the default first, then by name. */
export async function readTermsOverviews(
  orm: Orm,
  date: CalendarDate,
  termsIds?: readonly string[],
): Promise<TermsOverview[]> {
  const allTerms = await termsRepository(orm).findAll();
  const peopleCounts = await termsRepository(orm).countMembersOn(date);
  const patterns = await workingPatternRepository(orm).findPatterns();
  return allTerms
    .filter(({ id }) => !termsIds || termsIds.includes(id))
    .map((terms) => ({
      ...terms,
      peopleCount: peopleCounts.get(terms.id) ?? 0,
      workingWeek: (patterns.find(({ termsId }) => termsId === terms.id)?.versions ?? []).filter(
        ({ endDate }) => endDate === null || endDate >= date,
      ),
    }));
}
