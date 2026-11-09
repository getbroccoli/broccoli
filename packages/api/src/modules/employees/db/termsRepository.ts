import { and, asc, countDistinct, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { isUniqueViolation, type Orm, ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import { type Terms, type TermsMembership, TermsNameTakenError } from "../domain";
import { employeeTerms } from "./employeeTermsTable";
import { employments } from "./employmentsTable";
import { locations } from "./locationsTable";
import { TERMS_NAME_UNIQUE, terms } from "./termsTable";

/** Terms and who is on them, through the pool or inside a transaction. */
export interface TermsRepository {
  /**
   * Puts new employees on their location's default terms, or the default terms without one,
   * since their employment started.
   */
  joinDefaultTerms(employees: readonly { id: string; locationId: string | null }[]): Promise<void>;
  /** New terms with this name; returns their id. Throws `TermsNameTakenError` when other terms have the name. */
  insert(name: string): Promise<string>;
  /** Throws `TermsNameTakenError` like `insert`. */
  rename(termsId: string, name: string): Promise<void>;
  /** Holds the terms' row until the caller commits, so nobody joins them meanwhile; null when no terms have the id. */
  lock(termsId: string): Promise<Terms | null>;
  /**
   * Keeps the terms from being deleted until the caller commits, still letting others rename them or
   * point rows at them; false when no terms have the id.
   */
  keep(termsId: string): Promise<boolean>;
  /** Deletes the terms with their working pattern and time off policies; the database refuses while anyone was ever on them or a location starts people on them. */
  delete(termsId: string): Promise<void>;
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
  /** Puts the employee on these terms over time instead of their current rows. */
  replaceMemberships(employeeId: string, memberships: readonly TermsMembership[]): Promise<void>;
  /** The employees on each of the terms on any date, by terms id; terms without any are left out. */
  findMemberIds(termsIds: readonly string[]): Promise<Map<string, string[]>>;
  /** The terms among `termsIds` that anyone was ever on, on any date. */
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
      const [inserted] = await orm()
        .insert(terms)
        .values({ name })
        .returning({ id: terms.id })
        .catch(throwNameTaken);
      return inserted!.id;
    },

    async rename(termsId, name) {
      await orm().update(terms).set({ name }).where(eq(terms.id, termsId)).catch(throwNameTaken);
    },

    async lock(termsId) {
      const [locked] = await orm()
        .select({ id: terms.id, name: terms.name, key: terms.key })
        .from(terms)
        .where(eq(terms.id, termsId))
        .for("update");
      return locked ? termsOf(locked) : null;
    },

    async keep(termsId) {
      const [kept] = await orm()
        .select({ id: terms.id })
        .from(terms)
        .where(eq(terms.id, termsId))
        .for("key share");
      return kept !== undefined;
    },

    async delete(termsId) {
      await orm().delete(terms).where(eq(terms.id, termsId));
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

    async replaceMemberships(employeeId, memberships) {
      await orm().delete(employeeTerms).where(eq(employeeTerms.employeeId, employeeId));
      await orm()
        .insert(employeeTerms)
        .values(memberships.map((membership) => ({ employeeId, ...membership })));
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
      return rows.map(termsOf);
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

function termsOf({ id, name, key }: { id: string; name: string; key: string | null }): Terms {
  return { id, name, isDefault: key === "default_terms" };
}

function throwNameTaken(error: unknown): never {
  throw isUniqueViolation(error, TERMS_NAME_UNIQUE) ? new TermsNameTakenError() : error;
}
