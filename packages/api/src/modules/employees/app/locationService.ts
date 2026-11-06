import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import { locationRepository, termsRepository } from "../db";
import { type Location, LocationNameTakenError, parseLocationName } from "../domain";

/** A location with how many people are in it now, and the terms its new people start on. */
export interface LocationWithPeopleCount extends Location {
  peopleCount: number;
  /** Null: the default terms. */
  termsId: string | null;
}

/**
 * The places people work, which admins manage as workspace settings. Everyone who reads
 * employees reads them, since a person's location is an ordinary employee field.
 */
export interface LocationService {
  /** Every location, by name ignoring case, with how many people are in each. */
  listLocations: (ctx: SecurityContext) => Promise<LocationWithPeopleCount[]>;
  /**
   * Adds a location whose new people start on `termsId`, or on the default terms when it is left
   * out or null; refuses a name another location has, ignoring case. Admins only.
   */
  createLocation: (
    ctx: SecurityContext,
    input: { name: string; termsId?: string | null },
  ) => Promise<Location>;
  /**
   * Changes the fields given: a field left out stays, a null `termsId` gives the location the
   * default terms. A rename keeps the old name in people's history; new terms reach only people
   * added from now on. Admins only.
   */
  updateLocation: (
    ctx: SecurityContext,
    input: { id: string; name?: string | null; termsId?: string | null },
  ) => Promise<Location>;
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
      const { location, termsId } = await refuseTakenName(() =>
        transact(async (tx) => {
          const termsId = await requireTerms(tx, input.termsId ?? null);
          return { location: await locationRepository(tx).insert(name, termsId), termsId };
        }),
      );
      logger.info({ locationId: location.id, termsId }, "Added a location");
      return location;
    },
    async updateLocation(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const id = parseLocationId(input.id);
      // A location always has a name, so null is refused as a blank one.
      const name = input.name === undefined ? undefined : parseLocationName(input.name ?? "");
      const { before, changes } = await refuseTakenName(() =>
        transact(async (tx) => {
          const before = await locationRepository(tx).lockWithPeopleCount(id);
          if (!before) {
            throw locationNotFound();
          }
          const termsId =
            input.termsId === undefined ? undefined : await requireTerms(tx, input.termsId);
          const changes = {
            ...(name !== undefined && name !== before.name && { name }),
            ...(termsId !== undefined && termsId !== before.termsId && { termsId }),
          };
          if (Object.keys(changes).length > 0) {
            await locationRepository(tx).update(id, changes);
          }
          return { before, changes };
        }),
      );
      if (changes.name !== undefined) {
        logger.info({ locationId: id }, "Renamed a location");
      }
      if (changes.termsId !== undefined) {
        logger.info(
          {
            locationId: id,
            fromTermsId: before.termsId,
            toTermsId: changes.termsId,
            peopleCount: before.peopleCount,
          },
          "Changed a location's terms",
        );
      }
      return { id, name: changes.name ?? before.name };
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

/** The terms id, checked to exist; null stays null, the default terms. */
async function requireTerms(tx: Tx, termsId: string | null): Promise<string | null> {
  if (termsId === null) {
    return null;
  }
  const parsed = parseUuid(termsId);
  if (!parsed || !(await termsRepository(tx).exists(parsed))) {
    throw invalidInput([{ field: "termsId", code: "not_found" }]);
  }
  return parsed;
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
