import { asc, count, eq, sql } from "drizzle-orm";

import { isUniqueViolation, type Orm, ormOf, type Tx } from "../../../core/db";
import { type Location, locationNameKey, LocationNameTakenError } from "../domain";
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
   * The location of each trimmed name, by its name key, creating the ones no location has yet with
   * the first spelling given.
   */
  findOrCreate(names: readonly string[]): Promise<Map<string, Location>>;
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
        .select()
        .from(locations)
        .where(sql`${locations.id} = any(${sql.param([...ids])}::uuid[])`),

    findAndHold: async (id) => {
      const [location] = await orm()
        .select()
        .from(locations)
        .where(eq(locations.id, id))
        .for("share");
      return location ?? null;
    },

    insert: async (name) => {
      try {
        const [location] = await orm().insert(locations).values({ name }).returning();
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
          .returning();
        return location ?? null;
      } catch (error) {
        throw nameTakenOr(error);
      }
    },

    lockWithPeopleCount: async (id) => {
      const [location] = await orm()
        .select()
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
      const firstSpellings = new Map<string, string>();
      for (const name of names) {
        if (!firstSpellings.has(locationNameKey(name))) {
          firstSpellings.set(locationNameKey(name), name);
        }
      }
      if (firstSpellings.size === 0) {
        return new Map();
      }
      await orm()
        .insert(locations)
        .values([...firstSpellings.values()].map((name) => ({ name })))
        .onConflictDoNothing();
      const found = await orm()
        .select()
        .from(locations)
        .where(
          sql`lower(btrim(${locations.name})) = any(${sql.param([...firstSpellings.keys()])}::text[])`,
        );
      return new Map(found.map((location) => [locationNameKey(location.name), location]));
    },

    deleteAll: async () => {
      await orm().delete(locations);
    },
  };
}

function nameTakenOr(error: unknown): unknown {
  return isUniqueViolation(error, LOCATION_NAME_UNIQUE) ? new LocationNameTakenError() : error;
}
