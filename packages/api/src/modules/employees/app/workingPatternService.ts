import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid } from "../../../utils";
import { workingPatternRepository } from "../db";
import {
  type BankHolidayCalendar,
  parseBankHolidayCalendar,
  parseDateField,
  parsePatternName,
  parseWeek,
  weekInForce,
  type PatternWeek,
  type WeekdayMinutes,
  type WorkingPattern,
} from "../domain";
import { publishWorkingPatternChange } from "./publishWorkingPatternChange";

/**
 * The working patterns admins keep: their names and dated weeks. A change to a pattern's minutes
 * is a new week from a date, so earlier weeks keep theirs.
 */
export interface WorkingPatternService {
  /** Every pattern with its weeks, by name. Admins only. */
  listPatterns: (ctx: SecurityContext) => Promise<WorkingPattern[]>;
  /**
   * A new pattern whose only week applies from the beginning, with England and Wales bank holidays
   * unless another calendar is given. Admins only.
   */
  createPattern: (
    ctx: SecurityContext,
    input: {
      name: string;
      minutes: WeekdayMinutes;
      fullDayMinutes: number;
      bankHolidayCalendar?: string;
    },
  ) => Promise<WorkingPattern>;
  /** Renames a pattern for every date. Admins only. */
  renamePattern: (
    ctx: SecurityContext,
    input: { workingPatternId: string; name: string },
  ) => Promise<WorkingPattern>;
  /**
   * New minutes or calendar for a pattern from a date, replacing a week that starts on it; without
   * a calendar it keeps the one in force on that date. Admins only.
   */
  changePattern: (
    ctx: SecurityContext,
    input: {
      workingPatternId: string;
      effectiveFrom: string;
      minutes: WeekdayMinutes;
      fullDayMinutes: number;
      bankHolidayCalendar?: string;
    },
  ) => Promise<WorkingPattern>;
  /** Removes the week that starts on a date, so the one before applies again. Admins only. */
  removePatternWeek: (
    ctx: SecurityContext,
    input: { workingPatternId: string; effectiveFrom: string },
  ) => Promise<WorkingPattern>;
  /** Deletes a pattern no group or person is put on, other than Standard. Admins only. */
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
        return findPattern(tx, await repository.insertPattern(name, week));
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
        const pattern = existingPattern(patterns, input.workingPatternId);
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
      const effectiveFrom = parseDateField("effectiveFrom", input.effectiveFrom);
      const week = parseWeek(input);
      const calendar = optionalCalendar(input.bankHolidayCalendar);
      const saved = await transact(async (tx) => {
        const repository = workingPatternRepository(tx);
        await repository.lockForWrites();
        const pattern = existingPattern(await repository.findPatterns(), input.workingPatternId);
        await repository.saveWeek(pattern.id, {
          ...week,
          effectiveFrom,
          bankHolidayCalendar: calendar ?? calendarInForce(pattern.weeks, effectiveFrom),
        });
        publishWorkingPatternChange(
          tx,
          await repository.findEmployeesOnPattern(pattern.id),
          effectiveFrom,
        );
        return findPattern(tx, pattern.id);
      });
      logger.info(
        {
          workingPatternId: saved.id,
          effectiveFrom,
          bankHolidayCalendar: calendarInForce(saved.weeks, effectiveFrom),
        },
        "Changed a working pattern",
      );
      return saved;
    },

    async removePatternWeek(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveFrom = parseDateField("effectiveFrom", input.effectiveFrom);
      const saved = await transact(async (tx) => {
        const repository = workingPatternRepository(tx);
        await repository.lockForWrites();
        const pattern = existingPattern(await repository.findPatterns(), input.workingPatternId);
        if (!(await repository.deleteWeek(pattern.id, effectiveFrom))) {
          throw new ApplicationError(
            "NOT_FOUND",
            "The working pattern has no week from this date.",
          );
        }
        publishWorkingPatternChange(
          tx,
          await repository.findEmployeesOnPattern(pattern.id),
          effectiveFrom,
        );
        return findPattern(tx, pattern.id);
      });
      logger.info({ workingPatternId: saved.id, effectiveFrom }, "Removed a working pattern week");
      return saved;
    },

    async deletePattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const workingPatternId = await transact(async (tx) => {
        const repository = workingPatternRepository(tx);
        await repository.lockForWrites();
        const pattern = existingPattern(await repository.findPatterns(), input.workingPatternId);
        if (pattern.isStandard) {
          throw new ApplicationError("CONFLICT", "The Standard working pattern cannot be deleted.");
        }
        if (await repository.isPatternUsed(pattern.id)) {
          throw new ApplicationError(
            "CONFLICT",
            "A person or group is on this working pattern on some date, past or future, so it is kept.",
          );
        }
        await repository.deletePattern(pattern.id);
        return pattern.id;
      });
      logger.info({ workingPatternId }, "Deleted a working pattern");
    },
  };
}

/** The pattern an input names; refuses one that does not exist as invalid input. */
export function referencedPattern(patterns: readonly WorkingPattern[], workingPatternId: string) {
  const pattern = patterns.find(({ id }) => id === parseUuid(workingPatternId));
  if (!pattern) {
    throw invalidInput([{ field: "workingPatternId", code: "not_found" }]);
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

function calendarInForce(weeks: readonly PatternWeek[], date: CalendarDate): BankHolidayCalendar {
  // A pattern's first week starts from the beginning, so one is always in force.
  return weekInForce(weeks, date)!.bankHolidayCalendar;
}

function optionalCalendar(value: string | undefined): BankHolidayCalendar | null {
  return value === undefined ? null : parseBankHolidayCalendar(value);
}

function refuseTakenName(patterns: readonly WorkingPattern[], name: string) {
  if (patterns.some((pattern) => pattern.name === name)) {
    throw invalidInput([{ field: "name", code: "taken" }]);
  }
}
