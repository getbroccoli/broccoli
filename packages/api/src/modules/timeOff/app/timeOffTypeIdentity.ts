import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import { timeOffPolicyRepository } from "../db";
import {
  parseTimeOffTypeIdentity,
  type TimeOffType,
  type TimeOffTypeIdentity,
  TimeOffTypeBookedError,
  TimeOffTypeNameTakenError,
} from "../domain";

type Dependencies = Pick<ModuleDependencies, "transact" | "logger">;

const IDENTITY_FIELDS = ["name", "icon", "colour", "private"] as const;

/** Adds a company time off type; no terms offer it until they get rules for it. Admins only. */
export async function createType(
  { transact, logger }: Dependencies,
  ctx: SecurityContext,
  input: TimeOffTypeIdentity,
): Promise<TimeOffType> {
  ctx.require("MANAGE_WORKSPACE");
  const identity = parseTimeOffTypeIdentity(input, null);
  const type = await refuseTakenName(() =>
    transact((tx) => timeOffPolicyRepository(tx).insertType(identity)),
  );
  logger.info(
    { timeOffTypeId: type.id, icon: type.icon, colour: type.colour, private: type.private },
    "Added a time off type",
  );
  return type;
}

/** Changes a type's name, icon, colour and privacy, the same in every set of terms. Admins only. */
export async function changeType(
  { transact, logger }: Dependencies,
  ctx: SecurityContext,
  input: TimeOffTypeIdentity & { id: string },
): Promise<TimeOffType> {
  ctx.require("MANAGE_WORKSPACE");
  const id = parseUuid(input.id);
  if (!id) {
    throw typeNotFound();
  }
  const { before, after } = await refuseTakenName(() =>
    transact(async (tx) => {
      const repository = timeOffPolicyRepository(tx);
      const before = (await repository.findAllTypes()).find((type) => type.id === id);
      if (!before) {
        throw typeNotFound();
      }
      const identity = parseTimeOffTypeIdentity(input, before.typeKey);
      return { before, after: (await repository.updateType(id, identity))! };
    }),
  );
  logger.info(
    {
      timeOffTypeId: id,
      changedFields: IDENTITY_FIELDS.filter((field) => before[field] !== after[field]),
    },
    "Changed a time off type",
  );
  return after;
}

/**
 * Deletes a type with its rules on every terms, its exceptions and allowances; refuses one with
 * time off on record, whatever its status. Starting over brings a deleted standard type back. Admins only.
 */
export async function deleteType(
  { transact, logger }: Dependencies,
  ctx: SecurityContext,
  input: { id: string },
): Promise<void> {
  ctx.require("MANAGE_WORKSPACE");
  const id = parseUuid(input.id);
  if (!id) {
    throw typeNotFound();
  }
  try {
    const deleted = await transact(async (tx) => {
      const repository = timeOffPolicyRepository(tx);
      // Waits for allowance runs reading the type's rules, and holds new ones until it commits.
      await repository.lockPolicies();
      return repository.deleteType(id);
    });
    if (!deleted) {
      throw typeNotFound();
    }
  } catch (error) {
    if (error instanceof TimeOffTypeBookedError) {
      throw new ApplicationError("CONFLICT", "This type has time off on record.");
    }
    throw error;
  }
  logger.info({ timeOffTypeId: id }, "Deleted a time off type");
}

async function refuseTakenName<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof TimeOffTypeNameTakenError) {
      throw invalidInput([{ field: "name", code: "taken" }]);
    }
    throw error;
  }
}

function typeNotFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "No time off type has this id.");
}
