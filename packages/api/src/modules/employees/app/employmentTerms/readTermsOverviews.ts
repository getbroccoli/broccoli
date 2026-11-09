import type { Orm, Tx } from "../../../../core/db";
import type { CalendarDate } from "../../../../utils";
import { locationRepository, termsRepository, workingPatternRepository } from "../../db";
import {
  deleteBlockerOf,
  type Location,
  type PatternVersion,
  type Terms,
  type TermsDeleteBlocker,
  type WorkingPattern,
} from "../../domain";

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
  /** Why the terms cannot be deleted; null: they can. */
  deleteBlocker: TermsDeleteBlocker | null;
  /** Whether anyone was ever on the terms, on any dates. */
  hadPeople: boolean;
}

/** The terms among `termsIds`, or every set without, as they are on `date`; the default first, then by name. */
export async function readTermsOverviews(
  db: Orm | Tx,
  date: CalendarDate,
  termsIds?: readonly string[],
): Promise<TermsOverview[]> {
  const allTerms = await termsRepository(db).findAll();
  const shown = allTerms.filter(({ id }) => !termsIds || termsIds.includes(id));
  const peopleCounts = await termsRepository(db).countMembersOn(date);
  const everJoined = await termsRepository(db).findEverJoined(shown.map(({ id }) => id));
  const locations = await locationRepository(db).findAllWithPeopleCounts();
  const patterns = await workingPatternRepository(db).findPatterns();
  const defaultTermsId = allTerms.find(({ isDefault }) => isDefault)?.id;
  return shown.map((terms) => {
    const hadPeople = everJoined.has(terms.id);
    const termsLocations = locations
      .filter(({ termsId }) => (termsId ?? defaultTermsId) === terms.id)
      .map(({ id, name }) => ({ id, name }));
    return {
      ...terms,
      // Every set of terms gets its pattern when it is set up.
      workingPattern: patterns.find(({ termsId }) => termsId === terms.id)!,
      peopleCount: peopleCounts.get(terms.id) ?? 0,
      locations: termsLocations,
      workingWeek: (patterns.find(({ termsId }) => termsId === terms.id)?.versions ?? []).filter(
        ({ endDate }) => endDate === null || endDate >= date,
      ),
      hadPeople,
      deleteBlocker: deleteBlockerOf(terms, {
        hadPeople,
        locationCount: termsLocations.length,
      }),
    };
  });
}
