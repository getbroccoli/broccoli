import type { Orm, Tx } from "../../../../core/db";
import type { CalendarDate } from "../../../../utils";
import { locationRepository, termsRepository, workingPatternRepository } from "../../db";
import {
  type Assignment,
  deleteBlockerOf,
  earliestChangeDate,
  type Location,
  type PatternVersion,
  type PatternWeek,
  type Terms,
  type TermsDeleteBlocker,
} from "../../domain";

/** A set of terms as Settings shows it on a date. */
export interface TermsOverview extends Terms {
  /** People on the terms that day. */
  peopleCount: number;
  /** Locations whose new people start here, by name; the default terms also take locations without terms. */
  locations: Location[];
  /**
   * The terms' working week assignments from the start of that day's leave year on, oldest first,
   * with their versions: what a change from any date it may start on replaces.
   */
  workingWeek: TermsWorkingWeek[];
  /** The terms' unpublished working week; null when there is none. */
  unpublishedWorkingWeek: PatternVersion | null;
  /** The earliest date a change may apply from: the start of the leave year of that day. */
  earliestChange: CalendarDate;
  /** Why the terms cannot be deleted; null: they can. */
  deleteBlocker: TermsDeleteBlocker | null;
  /** Whether anyone was ever on the terms, on any dates. */
  hadPeople: boolean;
}

/** A version given to terms from a date to a date. */
export type TermsWorkingWeek = Assignment & { version: PatternVersion };

/** A working week from a date to a date, as GraphQL shows it; its id is the assignment's on terms. */
export type DatedWorkingWeek = PatternWeek & {
  id: string;
  startDate: CalendarDate;
  endDate: CalendarDate | null;
};

/** The terms among `termsIds`, or every set without, as they are on `date`; the default first, then by name. */
export async function readTermsOverviews(
  db: Orm | Tx,
  date: CalendarDate,
  termsIds?: readonly string[],
): Promise<TermsOverview[]> {
  const allTerms = await termsRepository(db).findAll();
  const shown = allTerms.filter(({ id }) => !termsIds || termsIds.includes(id));
  const shownIds = shown.map(({ id }) => id);
  const peopleCounts = await termsRepository(db).countMembersOn(date);
  const everJoined = await termsRepository(db).findEverJoined(shownIds);
  const locations = await locationRepository(db).findAllWithPeopleCounts();
  const patterns = workingPatternRepository(db);
  const versions = (await patterns.findPatterns()).flatMap((pattern) => pattern.versions);
  const assignments = await patterns.findAssignments({ termsIds: shownIds });
  const defaultTermsId = allTerms.find(({ isDefault }) => isDefault)?.id;
  return shown.map((terms) => {
    const hadPeople = everJoined.has(terms.id);
    const termsLocations = locations
      .filter(({ termsId }) => (termsId ?? defaultTermsId) === terms.id)
      .map(({ id, name }) => ({ id, name }));
    return {
      ...terms,
      peopleCount: peopleCounts.get(terms.id) ?? 0,
      locations: termsLocations,
      workingWeek: assignments
        .filter(
          ({ owner, endDate }) =>
            isOfTerms(owner, terms.id) && (!endDate || endDate >= earliestChangeDate(date)),
        )
        .map((row) => ({ ...row, version: versions.find(({ id }) => id === row.versionId)! })),
      unpublishedWorkingWeek:
        versions.find(({ status, termsId }) => status === "draft" && termsId === terms.id) ?? null,
      earliestChange: earliestChangeDate(date),
      hadPeople,
      deleteBlocker: deleteBlockerOf(terms, {
        hadPeople,
        locationCount: termsLocations.length,
      }),
    };
  });
}

function isOfTerms(owner: Assignment["owner"], termsId: string): boolean {
  return "termsId" in owner && owner.termsId === termsId;
}
