import { invalidInput } from "../../../../core/applicationError";
import type { Tx } from "../../../../core/db";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import { createRecordHistoryService } from "../../../../core/records";
import type { SecurityContext } from "../../../../core/security";
import { type CalendarDate, parseUuid, todayInLondon } from "../../../../utils";
import { parseBankHolidayCalendar } from "../../../bankHolidays";
import { employeeRepository, employmentRepository, workingPatternRepository } from "../../db";
import {
  cancelOwnWeekChange,
  type OwnWeek,
  ownWeekOn,
  parseChangeDate,
  parseDateField,
  parseWeek,
  type PatternWeek,
  type WeekdayMinutes,
  withOwnWeek,
  withoutOwnWeeks,
} from "../../domain";
import { employeeNotFound } from "../employeeNotFound";
import { readOwnWeeks, saveOwnWeeks } from "./ownWeeksStore";
import { publishWorkingPatternChange } from "./publishWorkingPatternChange";

const recordHistory = createRecordHistoryService();

/**
 * A person's own working week on top of their terms: set or changed from a date, given back to the
 * terms from a date, and a change that has not started cancelled. Admins only.
 */
export interface OwnWorkingWeekService {
  /** The person's own week from `startDate`, until their next own week or open-ended. */
  setOwnWorkingWeek: (
    ctx: SecurityContext,
    input: {
      employeeId: string;
      startDate: string;
      minutes: WeekdayMinutes;
      bankHolidayCalendar: string;
    },
  ) => Promise<void>;
  /** Their terms' week from `startDate`: an own week covering it ends the day before, later ones go. */
  useTermsWorkingWeek: (
    ctx: SecurityContext,
    input: { employeeId: string; startDate: string },
  ) => Promise<void>;
  /**
   * Removes an own-week change starting on `startDate` after today: a new own week, a change to it,
   * or a return to the terms. CONFLICT otherwise.
   */
  cancelOwnWorkingWeekChange: (
    ctx: SecurityContext,
    input: { employeeId: string; startDate: string },
  ) => Promise<void>;
}

export function createOwnWorkingWeekService({
  transact,
  logger,
  today = todayInLondon,
}: Pick<ModuleDependencies, "transact" | "logger"> & {
  today?: () => CalendarDate;
}): OwnWorkingWeekService {
  const change = (
    ctx: SecurityContext,
    input: { employeeId: string; startDate: string },
    apply: (weeks: OwnWeek[], from: CalendarDate) => Applied,
    // A cancel names a change already made, whatever has happened to the dates since.
    { cancel = false } = {},
  ) => changeOwnWeeks({ transact, today: today(), cancel }, ctx, input, apply);
  return {
    async setOwnWorkingWeek(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const week = {
        ...parseWeek(input),
        bankHolidayCalendar: parseBankHolidayCalendar(input.bankHolidayCalendar),
      };
      const changed = await change(ctx, input, (weeks, from) => ({
        weeks: withOwnWeek(weeks, from, week),
        before: ownWeekOn(weeks, from)?.week ?? null,
        after: week,
      }));
      logger.info(changed, "Set an own working week");
    },

    async useTermsWorkingWeek(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const changed = await change(ctx, input, (weeks, from) => ({
        weeks: withoutOwnWeeks(weeks, from),
        before:
          (ownWeekOn(weeks, from) ?? weeks.find(({ startDate }) => (startDate ?? "") > from))
            ?.week ?? null,
        after: null,
      }));
      logger.info(changed, "Put a person back on the terms' week");
    },

    async cancelOwnWorkingWeekChange(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const changed = await change(
        ctx,
        input,
        (weeks, from) => {
          const { weeks: kept, cancelled } = cancelOwnWeekChange(weeks, from, today());
          return { weeks: kept, before: cancelled, cancelled: true };
        },
        { cancel: true },
      );
      logger.info(changed, "Cancelled an own working week change");
    },
  };
}

/** A change to a person's own weeks, and what the history line says it changed. */
interface Applied {
  weeks: OwnWeek[];
  /** The week on the date before the change; null: the terms'. */
  before: PatternWeek | null;
  after?: PatternWeek | null;
  /** A planned change cancelled, so the line has no new value. */
  cancelled?: boolean;
}

/**
 * Runs one own-week change in a transaction: checks the person and date, saves their own weeks as
 * `apply` leaves them, adds the history line and publishes the working week change.
 */
async function changeOwnWeeks(
  {
    transact,
    today,
    cancel,
  }: { transact: ModuleDependencies["transact"]; today: CalendarDate; cancel: boolean },
  ctx: SecurityContext,
  input: { employeeId: string; startDate: string },
  apply: (weeks: OwnWeek[], from: CalendarDate) => Applied,
) {
  const employeeId = parseUuid(input.employeeId);
  if (!employeeId) throw employeeNotFound();
  return transact(async (tx) => {
    // The employee write lock first, as deleting an employee takes it, so the two cannot deadlock.
    await employmentRepository(tx).lockForWrites();
    await workingPatternRepository(tx).lockForWrites();
    if (!(await employeeRepository(tx).findById(employeeId))) throw employeeNotFound();
    const from = cancel
      ? parseDateField("startDate", input.startDate)
      : await parseFrom(tx, employeeId, input.startDate, today);
    const { weeks, versions } = await readOwnWeeks(tx, employeeId);
    const applied = apply(weeks, from);
    await saveOwnWeeks(tx, employeeId, versions, applied.weeks);
    await recordHistory.append(ctx, tx, {
      recordType: "employee",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [
        {
          recordId: employeeId,
          changes: [
            {
              field: "workingWeek",
              oldValue: weekValue(applied.before, from),
              newValue: applied.cancelled ? null : weekValue(applied.after ?? null, from),
            },
          ],
        },
      ],
    });
    publishWorkingPatternChange(tx, [employeeId], from);
    return { employeeId, startDate: from };
  });
}

/**
 * The date a change applies from: not before this leave year or the person's start, nor after
 * their employment ends.
 */
async function parseFrom(
  tx: Tx,
  employeeId: string,
  value: string,
  today: CalendarDate,
): Promise<CalendarDate> {
  const from = parseChangeDate(value, today);
  const periods = (await employmentRepository(tx).findPeriods([employeeId])).get(employeeId) ?? [];
  const start = periods[0]?.startDate ?? null;
  if (start && from < start) {
    throw invalidInput([{ field: "startDate", code: "too_early" }]);
  }
  const ends = periods.map(({ endDate }) => endDate);
  if (ends.length > 0 && ends.every((end) => end !== null && end < from)) {
    throw invalidInput([{ field: "startDate", code: "after_leaving" }]);
  }
  return from;
}

/** A week as the line in history keeps it, with the date it applies from; a null week is the terms'. */
function weekValue(week: PatternWeek | null, startDate: CalendarDate): string {
  return JSON.stringify({
    week: week && { minutes: week.minutes, bankHolidayCalendar: week.bankHolidayCalendar },
    startDate,
  });
}
