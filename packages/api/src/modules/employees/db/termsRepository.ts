import { and, asc, countDistinct, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import type { Terms, TermsMembership } from "../domain";
import { employeeTerms } from "./employeeTermsTable";
import { employments } from "./employmentsTable";
import { locations } from "./locationsTable";
import { terms } from "./termsTable";

/** Terms and who is on them, through the pool or inside a transaction. */
export interface TermsRepository {
  /**
   * Puts new employees on their location's default terms, or the default terms without one,
   * since their employment started.
   */
  joinDefaultTerms(employees: readonly { id: string; locationId: string | null }[]): Promise<void>;
  /** New terms with this name; returns their id. */
  insert(name: string): Promise<string>;
  rename(termsId: string, name: string): Promise<void>;
  /**
   * Deletes every terms but the default ones, with their working patterns and time off policies,
   * and names the default terms "England and Wales" again; the terms must have no members.
   */
  resetToDefault(): Promise<void>;
  /** The id of the default terms, the seeded "England and Wales". */
  findDefaultTermsId(): Promise<string>;
  /** Each of the terms' name, by id. */
  findNames(termsIds: readonly string[]): Promise<Map<string, string>>;
  /** Whether terms have this id. */
  exists(termsId: string): Promise<boolean>;
  /** Each employee's terms over time, by employee id. */
  findMemberships(employeeIds: readonly string[]): Promise<Map<string, TermsMembership[]>>;
  /** The employees on each of the terms on any date, by terms id; terms without any are left out. */
  findMemberIds(termsIds: readonly string[]): Promise<Map<string, string[]>>;
  /** The terms among `termsIds` anyone was ever on, on any dates. */
  findEverJoined(termsIds: readonly string[]): Promise<Set<string>>;
  /** Every set of terms, the default first, then by name ignoring case. */
  findAll(): Promise<Terms[]>;
  /**
   * How many people are on each of the terms on `date`, by terms id: their membership and an
   * employment cover the date. Terms without any are left out.
   */
  countMembersOn(date: CalendarDate): Promise<Map<string, number>>;
}

export function termsRepository(db: Orm | Tx): TermsRepository {
  const orm = () => ormOf(db);
  return {
    async joinDefaultTerms(employees) {
      if (employees.length === 0) {
        return;
      }
      const defaultTermsId = await findDefaultTermsId(orm());
      const locationIds = [...new Set(employees.flatMap(({ locationId }) => locationId ?? []))];
      const locationTerms = new Map(
        locationIds.length === 0
          ? []
          : (
              await orm()
                .select({ id: locations.id, termsId: locations.defaultTermsId })
                .from(locations)
                .where(inArray(locations.id, locationIds))
            ).map(({ id, termsId }) => [id, termsId]),
      );
      await orm()
        .insert(employeeTerms)
        .values(
          employees.map(({ id, locationId }) => ({
            employeeId: id,
            termsId: (locationId && locationTerms.get(locationId)) || defaultTermsId,
          })),
        );
    },

    async insert(name) {
      const [inserted] = await orm().insert(terms).values({ name }).returning({ id: terms.id });
      return inserted!.id;
    },

    async rename(termsId, name) {
      await orm().update(terms).set({ name }).where(eq(terms.id, termsId));
    },

    async resetToDefault() {
      await orm().delete(terms).where(isNull(terms.key));
      await orm()
        .update(terms)
        .set({ name: DEFAULT_TERMS_NAME })
        .where(eq(terms.key, "default_terms"));
    },

    findDefaultTermsId: () => findDefaultTermsId(orm()),

    async findNames(termsIds) {
      const rows = await orm()
        .select({ id: terms.id, name: terms.name })
        .from(terms)
        .where(inArray(terms.id, [...termsIds]));
      return new Map(rows.map(({ id, name }) => [id, name]));
    },

    async exists(termsId) {
      const [found] = await orm().select({ id: terms.id }).from(terms).where(eq(terms.id, termsId));
      return found !== undefined;
    },

    async findMemberships(employeeIds) {
      const rows = await orm()
        .select()
        .from(employeeTerms)
        .where(inArray(employeeTerms.employeeId, [...employeeIds]));
      const memberships = new Map<string, TermsMembership[]>();
      for (const { employeeId, termsId, startDate, endDate } of rows) {
        const membership = { termsId, startDate, endDate };
        memberships.set(employeeId, [...(memberships.get(employeeId) ?? []), membership]);
      }
      return memberships;
    },

    async findMemberIds(termsIds) {
      const rows = await orm()
        .selectDistinct({ termsId: employeeTerms.termsId, employeeId: employeeTerms.employeeId })
        .from(employeeTerms)
        .where(inArray(employeeTerms.termsId, [...termsIds]));
      return new Map(
        [...Map.groupBy(rows, ({ termsId }) => termsId)].map(([termsId, members]) => [
          termsId,
          members.map(({ employeeId }) => employeeId),
        ]),
      );
    },

    async findEverJoined(termsIds) {
      const rows = await orm()
        .selectDistinct({ termsId: employeeTerms.termsId })
        .from(employeeTerms)
        .where(inArray(employeeTerms.termsId, [...termsIds]));
      return new Set(rows.map(({ termsId }) => termsId));
    },

    async findAll() {
      const rows = await orm()
        .select({ id: terms.id, name: terms.name, key: terms.key })
        .from(terms)
        .orderBy(desc(sql`${terms.key} is not null`), asc(sql`lower(${terms.name})`));
      return rows.map(({ id, name, key }) => ({ id, name, isDefault: key === "default_terms" }));
    },

    async countMembersOn(date) {
      const rows = await orm()
        .select({
          termsId: employeeTerms.termsId,
          members: countDistinct(employeeTerms.employeeId),
        })
        .from(employeeTerms)
        .innerJoin(employments, eq(employments.employeeId, employeeTerms.employeeId))
        .where(
          and(
            or(isNull(employeeTerms.startDate), lte(employeeTerms.startDate, date)),
            or(isNull(employeeTerms.endDate), gte(employeeTerms.endDate, date)),
            or(isNull(employments.startDate), lte(employments.startDate, date)),
            or(isNull(employments.endDate), gte(employments.endDate, date)),
          ),
        )
        .groupBy(employeeTerms.termsId);
      return new Map(rows.map(({ termsId, members }) => [termsId, members]));
    },
  };
}

/** The seeded name of the default terms, which Reset setup and Exit demo give back. */
const DEFAULT_TERMS_NAME = "England and Wales";

async function findDefaultTermsId(orm: ReturnType<typeof ormOf>): Promise<string> {
  const [defaultTerms] = await orm
    .select({ id: terms.id })
    .from(terms)
    .where(eq(terms.key, "default_terms"));
  return defaultTerms!.id;
}
