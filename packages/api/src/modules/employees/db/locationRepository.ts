import { asc, count, eq, sql } from "drizzle-orm";

import { isUniqueViolation, type Orm, ormOf, type Tx } from "../../../core/db";
import { type Location, LocationNameTakenError } from "../domain";
import { employees } from "./employeesTable";
import { LOCATION_NAME_UNIQUE, locations } from "./locationsTable";

/** Locations stored in Postgres, through the pool or inside a transaction. */
export interface LocationRepository {
  /** Every location with how many people are in it, by name ignoring case. */
  findAllWithPeopleCounts(): Promise<(Location & { peopleCount: number })[]>;
  /** The locations among these ids that exist. */
  findByIds(ids: readonly string[]): Promise<Location[]>;
  /** The location, held until the caller commits so nobody deletes it meanwhile; null when there is none. */
  findAndHold(id: string): Promise<Location | null>;
  /** Throws `LocationNameTakenError` when another location has the name. */
  insert(name: string): Promise<Location>;
  /** The renamed location, or null when no location has the id; throws `LocationNameTakenError` like `insert`. */
  rename(id: string, name: string): Promise<Location | null>;
  /**
   * Holds the location's row until the caller commits, so nobody moves into it while it is
   * deleted, and returns it with how many people are in it; null when no location has the id.
   */
  lockWithPeopleCount(id: string): Promise<(Location & { peopleCount: number }) | null>;
  delete(id: string): Promise<void>;
  /**
   * The location of each trimmed name, by that name, matching ignoring case and creating the ones no
   * location has yet with the first spelling given.
   */
  findOrCreate(names: readonly string[]): Promise<Map<string, Location>>;
  /** Gives each location named, ignoring case and surrounding spaces, its default terms. */
  setDefaultTerms(entries: readonly { locationName: string; termsId: string }[]): Promise<void>;
  deleteAll(): Promise<void>;
}

export function locationRepository(db: Orm | Tx): LocationRepository {
  const orm = () => ormOf(db);

  return {
    findAllWithPeopleCounts: () =>
      orm()
        .select({ id: locations.id, name: locations.name, peopleCount: count(employees.id) })
        .from(locations)
        .leftJoin(employees, eq(employees.locationId, locations.id))
        .groupBy(locations.id)
        .orderBy(asc(sql`lower(${locations.name})`), asc(locations.id)),

    findByIds: (ids) =>
      orm()
        .select(LOCATION)
        .from(locations)
        .where(sql`${locations.id} = any(${sql.param([...ids])}::uuid[])`),

    findAndHold: async (id) => {
      const [location] = await orm()
        .select(LOCATION)
        .from(locations)
        .where(eq(locations.id, id))
        .for("share");
      return location ?? null;
    },

    insert: async (name) => {
      try {
        const [location] = await orm().insert(locations).values({ name }).returning(LOCATION);
        return location!;
      } catch (error) {
        throw nameTakenOr(error);
      }
    },

    rename: async (id, name) => {
      try {
        const [location] = await orm()
          .update(locations)
          .set({ name })
          .where(eq(locations.id, id))
          .returning(LOCATION);
        return location ?? null;
      } catch (error) {
        throw nameTakenOr(error);
      }
    },

    lockWithPeopleCount: async (id) => {
      const [location] = await orm()
        .select(LOCATION)
        .from(locations)
        .where(eq(locations.id, id))
        .for("update");
      if (!location) {
        return null;
      }
      const [{ peopleCount }] = (await orm()
        .select({ peopleCount: count() })
        .from(employees)
        .where(eq(employees.locationId, id))) as [{ peopleCount: number }];
      return { ...location, peopleCount };
    },

    delete: async (id) => {
      await orm().delete(locations).where(eq(locations.id, id));
    },

    findOrCreate: async (names) => {
      if (names.length === 0) {
        return new Map();
      }
      // Postgres alone decides which names match, by the unique index; a repeat is skipped.
      const distinct = [...new Set(names)];
      for (let start = 0; start < distinct.length; start += INSERT_BATCH_SIZE) {
        await orm()
          .insert(locations)
          .values(distinct.slice(start, start + INSERT_BATCH_SIZE).map((name) => ({ name })))
          .onConflictDoNothing();
      }
      const { rows } = await orm().execute<{ given: string; id: string; name: string }>(sql`
        select given, ${locations.id} as id, ${locations.name} as name
        from unnest(${sql.param([...names])}::text[]) as given
        join ${locations} on lower(btrim(${locations.name})) = lower(btrim(given))
      `);
      return new Map(rows.map(({ given, id, name }) => [given, { id, name }]));
    },

    setDefaultTerms: async (entries) => {
      if (entries.length === 0) {
        return;
      }
      await orm().execute(sql`
        update ${locations} set default_terms_id = chosen.terms_id
        from unnest(
          ${sql.param(entries.map(({ locationName }) => locationName))}::text[],
          ${sql.param(entries.map(({ termsId }) => termsId))}::uuid[]
        ) as chosen (name, terms_id)
        where lower(btrim(${locations.name})) = lower(btrim(chosen.name))
      `);
    },

    deleteAll: async () => {
      await orm().delete(locations);
    },
  };
}

/** A location's own columns; its default terms are read only when people join. */
const LOCATION = { id: locations.id, name: locations.name };

/** Rows per insert, well below Postgres's limit of 65,535 parameters. */
const INSERT_BATCH_SIZE = 1_000;

function nameTakenOr(error: unknown): unknown {
  return isUniqueViolation(error, LOCATION_NAME_UNIQUE) ? new LocationNameTakenError() : error;
}
