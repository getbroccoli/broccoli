import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, coversDate, parseUuid } from "../../../utils";
import { type BankHolidayCalendar, parseBankHolidayCalendar } from "../../bankHolidays";
import { workingPatternRepository } from "../db";
import {
  makeRoomForDatedRow,
  parseDateField,
  parsePatternName,
  parseWeek,
  type PatternVersion,
  type WeekdayMinutes,
  type WorkingPattern,
} from "../domain";
import { publishWorkingPatternChange } from "./publishWorkingPatternChange";

/**
 * The working patterns admins keep: each set of terms' own and the named ones people are put on,
 * with their versions. A change to a pattern's minutes is a new version from a date, so earlier
 * days keep theirs.
 */
export interface WorkingPatternService {
  /** Every pattern with its versions: named ones by name, then the terms'. Admins only. */
  listPatterns: (ctx: SecurityContext) => Promise<WorkingPattern[]>;
  /**
   * A new named pattern whose only version applies from the beginning, with England and Wales bank
   * holidays unless another calendar is given. Admins only.
   */
  createPattern: (
    ctx: SecurityContext,
    input: {
      name: string;
      minutes: WeekdayMinutes;
      bankHolidayCalendar?: string;
    },
  ) => Promise<WorkingPattern>;
  /** Renames a named pattern for every date. Admins only. */
  renamePattern: (
    ctx: SecurityContext,
    input: { workingPatternId: string; name: string },
  ) => Promise<WorkingPattern>;
  /**
   * New minutes or calendar for a pattern from a date: the version covering it ends the day before
   * and the new one runs to that version's end; one starting on the date is replaced, keeping its
   * end. Without a calendar it keeps the one in force on that date. Admins only.
   */
  changePattern: (
    ctx: SecurityContext,
    input: {
      workingPatternId: string;
      startDate: string;
      minutes: WeekdayMinutes;
      bankHolidayCalendar?: string;
    },
  ) => Promise<WorkingPattern>;
  /** Removes the version that starts on a date; the one before runs to its end. Admins only. */
  removePatternVersion: (
    ctx: SecurityContext,
    input: { workingPatternId: string; startDate: string },
  ) => Promise<WorkingPattern>;
  /** Deletes a named pattern no person is put on. Admins only. */
  deletePattern: (ctx: SecurityContext, input: { workingPatternId: string }) => Promise<void>;
}

export function createWorkingPatternService({
  orm,
  transact,
  logger,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger">): WorkingPatternService {
  return {
    async listPatterns(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      return workingPatternRepository(orm).findPatterns();
    },

    async createPattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const name = parsePatternName(input.name);
      const week = {
        ...parseWeek(input),
        bankHolidayCalendar: optionalCalendar(input.bankHolidayCalendar) ?? "england_and_wales",
      };
      const saved = await transact(async (tx) => {
        const repository = workingPatternRepository(tx);
        await repository.lockForWrites();
        refuseTakenName(await repository.findPatterns(), name);
        return findPattern(tx, await repository.insertPattern({ name }, week));
      });
      logger.info(
        { workingPatternId: saved.id, bankHolidayCalendar: week.bankHolidayCalendar },
        "Created a working pattern",
      );
      return saved;
    },

    async renamePattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const name = parsePatternName(input.name);
      const saved = await transact(async (tx) => {
        const repository = workingPatternRepository(tx);
        await repository.lockForWrites();
        const patterns = await repository.findPatterns();
        const pattern = namedPattern(patterns, input.workingPatternId);
        refuseTakenName(
          patterns.filter(({ id }) => id !== pattern.id),
          name,
        );
        await repository.renamePattern(pattern.id, name);
        return findPattern(tx, pattern.id);
      });
      logger.info({ workingPatternId: saved.id }, "Renamed a working pattern");
      return saved;
    },

    async changePattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const startDate = parseDateField("startDate", input.startDate);
      const week = parseWeek(input);
      const calendar = optionalCalendar(input.bankHolidayCalendar);
      const saved = await transact(async (tx) => {
        const repository = workingPatternRepository(tx);
        await repository.lockForWrites();
        const pattern = existingPattern(await repository.findPatterns(), input.workingPatternId);
        const inForce = versionInForce(pattern.versions, startDate);
        const { ended, replaced } = makeRoomForDatedRow(
          pattern.versions,
          startDate,
          inForce.endDate,
        );
        if (replaced) {
          await repository.deleteVersion(replaced.id);
        }
        if (ended) {
          await repository.endVersion(ended.id, addDays(startDate, -1));
        }
        await repository.insertVersion(pattern.id, {
          ...week,
          startDate,
          endDate: inForce.endDate,
          bankHolidayCalendar: calendar ?? inForce.bankHolidayCalendar,
        });
        publishWorkingPatternChange(
          tx,
          await repository.findEmployeesOnPattern(pattern.id),
          startDate,
        );
        return findPattern(tx, pattern.id);
      });
      logger.info(
        {
          workingPatternId: saved.id,
          startDate,
          bankHolidayCalendar: versionInForce(saved.versions, startDate).bankHolidayCalendar,
        },
        "Changed a working pattern",
      );
      return saved;
    },

    async removePatternVersion(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const startDate = parseDateField("startDate", input.startDate);
      const saved = await transact(async (tx) => {
        const repository = workingPatternRepository(tx);
        await repository.lockForWrites();
        const pattern = existingPattern(await repository.findPatterns(), input.workingPatternId);
        const removed = pattern.versions.find((version) => version.startDate === startDate);
        if (!removed) {
          throw new ApplicationError(
            "NOT_FOUND",
            "The working pattern has no version from this date.",
          );
        }
        const before = versionInForce(pattern.versions, addDays(startDate, -1));
        await repository.deleteVersion(removed.id);
        await repository.endVersion(before.id, removed.endDate);
        publishWorkingPatternChange(
          tx,
          await repository.findEmployeesOnPattern(pattern.id),
          startDate,
        );
        return findPattern(tx, pattern.id);
      });
      logger.info({ workingPatternId: saved.id, startDate }, "Removed a working pattern version");
      return saved;
    },

    async deletePattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const workingPatternId = await transact(async (tx) => {
        const repository = workingPatternRepository(tx);
        await repository.lockForWrites();
        const pattern = namedPattern(await repository.findPatterns(), input.workingPatternId);
        if (await repository.isPatternAssigned(pattern.id)) {
          throw new ApplicationError(
            "CONFLICT",
            "A person is on this working pattern on some date, past or future, so it is kept.",
          );
        }
        await repository.deletePattern(pattern.id);
        return pattern.id;
      });
      logger.info({ workingPatternId }, "Deleted a working pattern");
    },
  };
}

/**
 * The named pattern an input puts a person on; refuses one that does not exist, and a terms' own,
 * as invalid input.
 */
export function referencedPattern(patterns: readonly WorkingPattern[], workingPatternId: string) {
  const pattern = patterns.find(({ id }) => id === parseUuid(workingPatternId));
  if (!pattern) {
    throw invalidInput([{ field: "workingPatternId", code: "not_found" }]);
  }
  if (pattern.termsId) {
    throw invalidInput([{ field: "workingPatternId", code: "belongs_to_terms" }]);
  }
  return pattern;
}

async function findPattern(db: Orm | Tx, workingPatternId: string): Promise<WorkingPattern> {
  const patterns = await workingPatternRepository(db).findPatterns();
  return patterns.find(({ id }) => id === workingPatternId)!;
}

/** The pattern acted on; refuses one that does not exist with NOT_FOUND. */
function existingPattern(patterns: readonly WorkingPattern[], workingPatternId: string) {
  const pattern = patterns.find(({ id }) => id === parseUuid(workingPatternId));
  if (!pattern) {
    throw new ApplicationError("NOT_FOUND", "No working pattern has this id.");
  }
  return pattern;
}

/** A named pattern acted on; refuses a terms' own with CONFLICT, as it goes only with its terms. */
function namedPattern(patterns: readonly WorkingPattern[], workingPatternId: string) {
  const pattern = existingPattern(patterns, workingPatternId);
  if (pattern.termsId) {
    throw new ApplicationError("CONFLICT", "A terms' working pattern changes only with its terms.");
  }
  return pattern;
}

function versionInForce(versions: readonly PatternVersion[], date: CalendarDate): PatternVersion {
  // A pattern's first version starts from the beginning and none ends, so one is always in force.
  return versions.find((version) => coversDate(version, date))!;
}

function optionalCalendar(value: string | undefined): BankHolidayCalendar | null {
  return value === undefined ? null : parseBankHolidayCalendar(value);
}

function refuseTakenName(patterns: readonly WorkingPattern[], name: string) {
  if (patterns.some((pattern) => pattern.name === name)) {
    throw invalidInput([{ field: "name", code: "taken" }]);
  }
}
