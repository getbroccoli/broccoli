import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import { locationRepository } from "../db";
import { type Location, LocationNameTakenError, parseLocationName } from "../domain";

/** A location with how many people are in it now. */
export interface LocationWithPeopleCount extends Location {
  peopleCount: number;
}

/**
 * The places people work, which admins manage as workspace settings. Everyone who reads
 * employees reads them, since a person's location is an ordinary employee field.
 */
export interface LocationService {
  /** Every location, by name ignoring case, with how many people are in each. */
  listLocations: (ctx: SecurityContext) => Promise<LocationWithPeopleCount[]>;
  /** Adds a location; refuses a name another location has, ignoring case. Admins only. */
  createLocation: (ctx: SecurityContext, input: { name: string }) => Promise<Location>;
  /** Renames a location; its people's history keeps the old name. Admins only. */
  updateLocation: (ctx: SecurityContext, input: { id: string; name: string }) => Promise<Location>;
  /** Deletes a location nobody is in; refuses one someone is in with CONFLICT. Admins only. */
  deleteLocation: (
    ctx: SecurityContext,
    input: { id: string },
  ) => Promise<{ deletedLocationId: string }>;
}

export function createLocationService({
  orm,
  transact,
  logger,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger">): LocationService {
  const locations = locationRepository(orm);
  return {
    async listLocations(ctx) {
      await requireEmployeeRead(ctx);
      return locations.findAllWithPeopleCounts();
    },
    async createLocation(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const name = parseLocationName(input.name);
      const location = await refuseTakenName(() =>
        transact((tx) => locationRepository(tx).insert(name)),
      );
      logger.info({ locationId: location.id }, "Added a location");
      return location;
    },
    async updateLocation(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const id = parseLocationId(input.id);
      const name = parseLocationName(input.name);
      const location = await refuseTakenName(() =>
        transact((tx) => locationRepository(tx).rename(id, name)),
      );
      if (!location) {
        throw locationNotFound();
      }
      logger.info({ locationId: id }, "Renamed a location");
      return location;
    },
    async deleteLocation(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const id = parseLocationId(input.id);
      await transact(async (tx) => {
        const location = await locationRepository(tx).lockWithPeopleCount(id);
        if (!location) {
          throw locationNotFound();
        }
        if (location.peopleCount > 0) {
          throw new ApplicationError("CONFLICT", `Move everyone out of ${location.name} first.`);
        }
        await locationRepository(tx).delete(id);
      });
      logger.info({ locationId: id }, "Deleted a location");
      return { deletedLocationId: id };
    },
  };
}

/** Locations are read with employees: a caller who reads no employee reads no location. */
async function requireEmployeeRead(ctx: SecurityContext): Promise<void> {
  if ((await ctx.recordScope("employee", "read")) === "none") {
    throw new ApplicationError("FORBIDDEN", "You are not allowed to do this.");
  }
}

function parseLocationId(id: string): string {
  const parsed = parseUuid(id);
  if (!parsed) {
    throw locationNotFound();
  }
  return parsed;
}

async function refuseTakenName<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof LocationNameTakenError) {
      throw invalidInput([{ field: "name", code: "taken" }]);
    }
    throw error;
  }
}

function locationNotFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "No location has this id.");
}
