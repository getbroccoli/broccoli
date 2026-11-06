import type { Orm } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import { locationRepository, termsRepository, workingPatternRepository } from "../db";
import type { Location, PatternVersion, Terms, WorkingPattern } from "../domain";

/** A set of terms as Settings shows it on a date. */
export interface TermsOverview extends Terms {
  /** People on the terms that day. */
  peopleCount: number;
  /** Locations whose new people start here, by name; the default terms also take locations without terms. */
  locations: Location[];
  /** The terms' pattern versions covering that day or later, oldest first: the day's, then planned ones. */
  workingWeek: PatternVersion[];
  /** The terms' own pattern, with all its versions. */
  workingPattern: WorkingPattern;
}

/** The terms among `termsIds`, or every set without, as they are on `date`; the default first, then by name. */
export async function readTermsOverviews(
  orm: Orm,
  date: CalendarDate,
  termsIds?: readonly string[],
): Promise<TermsOverview[]> {
  const allTerms = await termsRepository(orm).findAll();
  const peopleCounts = await termsRepository(orm).countMembersOn(date);
  const locations = await locationRepository(orm).findWithStartingTerms();
  const patterns = await workingPatternRepository(orm).findPatterns();
  const defaultTermsId = allTerms.find(({ isDefault }) => isDefault)?.id;
  return allTerms
    .filter(({ id }) => !termsIds || termsIds.includes(id))
    .map((terms) => ({
      ...terms,
      // Every set of terms gets its pattern when it is set up.
      workingPattern: patterns.find(({ termsId }) => termsId === terms.id)!,
      peopleCount: peopleCounts.get(terms.id) ?? 0,
      locations: locations
        .filter(({ termsId }) => (termsId ?? defaultTermsId) === terms.id)
        .map(({ id, name }) => ({ id, name })),
      workingWeek: (patterns.find(({ termsId }) => termsId === terms.id)?.versions ?? []).filter(
        ({ endDate }) => endDate === null || endDate >= date,
      ),
    }));
}
