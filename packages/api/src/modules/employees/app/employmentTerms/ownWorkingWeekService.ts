import { ApplicationError, invalidInput } from "../../../../core/applicationError";
import type { Tx } from "../../../../core/db";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import { createRecordHistoryService } from "../../../../core/records";
import type { SecurityContext } from "../../../../core/security";
import {
  addDays,
  type CalendarDate,
  coversDate,
  parseUuid,
  todayInLondon,
} from "../../../../utils";
import { parseBankHolidayCalendar } from "../../../bankHolidays";
import { employeeRepository, employmentRepository, workingPatternRepository } from "../../db";
import {
  cancelPlannedVersion,
  type DatedPattern,
  parseChangeDate,
  parseWeek,
  type PatternVersion,
  type WeekdayMinutes,
  type WorkingPattern,
} from "../../domain";
import { employeeNotFound } from "../employeeNotFound";
import { publishWorkingPatternChange } from "./publishWorkingPatternChange";
import { addVersion, versionInForce } from "./workingPatternService";

const recordHistory = createRecordHistoryService();

/**
 * A person's own working week on top of their terms: set or changed from a date, given back to the
 * terms from a date, and a change that has not started cancelled. Admins only.
 */
export interface OwnWorkingWeekService {
  /** The person's own week from `startDate`, open-ended; changes it when they have one then. */
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
  return {
    async setOwnWorkingWeek(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const week = {
        ...parseWeek(input),
        bankHolidayCalendar: parseBankHolidayCalendar(input.bankHolidayCalendar),
      };
      const change = await changeOwnWeek(transact, ctx, input, today(), async (person) => {
        const before = person.ownWeekOn(person.from);
        const pattern = person.pattern ?? (await person.createPattern(week));
        if (person.pattern) {
          const inForce = versionInForce(pattern.versions, person.from);
          await addVersion(person.tx, pattern, {
            ...week,
            startDate: person.from,
            endDate: inForce.endDate,
          });
        }
        if (!before) await person.assign(pattern.id);
        return { before: weekOf(before), after: weekOf(week), workingPatternId: pattern.id };
      });
      logger.info(change, "Set an own working week");
    },

    async useTermsWorkingWeek(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const change = await changeOwnWeek(transact, ctx, input, today(), async (person) => {
        const before = person.ownWeekOn(person.from);
        const ending = person.assignments.filter(
          (row) => coversDate(row, person.from) || (row.startDate ?? "") > person.from,
        );
        if (ending.length === 0) {
          throw invalidInput([{ field: "startDate", code: "no_own_week" }]);
        }
        const repository = workingPatternRepository(person.tx);
        for (const row of ending) {
          if ((row.startDate ?? "") < person.from) {
            await repository.endAssignment(row.id, addDays(person.from, -1));
          } else {
            await repository.deleteAssignment(row.id);
          }
        }
        return {
          before: weekOf(before ?? person.firstOwnWeekAfter()),
          after: null,
          workingPatternId: person.pattern?.id ?? null,
        };
      });
      logger.info(change, "Put a person back on the terms' week");
    },

    async cancelOwnWorkingWeekChange(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const change = await changeOwnWeek(transact, ctx, input, today(), (person) =>
        cancelChange(person, today()),
      );
      logger.info(change, "Cancelled an own working week change");
    },
  };
}

/** What one person's own-week change acts on, inside its transaction. */
interface OwnWeekPerson {
  tx: Tx;
  employeeId: string;
  /** The date the change applies from. */
  from: CalendarDate;
  /** Their personal pattern; null until they first get an own week. */
  pattern: WorkingPattern | null;
  /** Their dated assignments to own patterns. */
  assignments: DatedPattern[];
  /** Their own week's version on `date`; null when their terms' applies. */
  ownWeekOn: (date: CalendarDate) => PatternVersion | null;
  /** The first own week starting after `from`, for a return that drops a planned one. */
  firstOwnWeekAfter: () => PatternVersion | null;
  createPattern: (
    week: Pick<PatternVersion, "minutes" | "bankHolidayCalendar">,
  ) => Promise<WorkingPattern>;
  /** Puts them on the pattern from `from` until their next own week, or open-ended. */
  assign: (workingPatternId: string) => Promise<void>;
}

/** A week as the line in history keeps it; null: their terms' week. */
type WeekValue = { minutes: readonly number[]; bankHolidayCalendar: string } | null;

/**
 * Runs one own-week change in a transaction: checks the person and date, then writes the history
 * line from what `change` returns and publishes the working week change.
 */
async function changeOwnWeek(
  transact: ModuleDependencies["transact"],
  ctx: SecurityContext,
  input: { employeeId: string; startDate: string },
  today: CalendarDate,
  change: (person: OwnWeekPerson) => Promise<{
    before: WeekValue;
    after: WeekValue;
    workingPatternId: string | null;
    cancelled?: boolean;
  }>,
) {
  const employeeId = parseUuid(input.employeeId);
  if (!employeeId) throw employeeNotFound();
  return transact(async (tx) => {
    // The employee write lock first, as deleting an employee takes it, so the two cannot deadlock.
    await employmentRepository(tx).lockForWrites();
    await workingPatternRepository(tx).lockForWrites();
    if (!(await employeeRepository(tx).findById(employeeId))) throw employeeNotFound();
    const from = await parseFrom(tx, employeeId, input.startDate, today);
    const person = await readPerson(tx, employeeId, from);
    const { before, after, workingPatternId, cancelled } = await change(person);
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
              oldValue: JSON.stringify({ week: before, startDate: from }),
              newValue: cancelled ? null : JSON.stringify({ week: after, startDate: from }),
            },
          ],
        },
      ],
    });
    publishWorkingPatternChange(tx, [employeeId], from);
    return { employeeId, workingPatternId, startDate: from };
  });
}

/** The date a change applies from: not before this leave year, nor before the person starts. */
async function parseFrom(
  tx: Tx,
  employeeId: string,
  value: string,
  today: CalendarDate,
): Promise<CalendarDate> {
  const from = parseChangeDate(value, today);
  const start = (await employmentRepository(tx).findStartDates([employeeId])).get(employeeId);
  if (start && from < start) {
    throw invalidInput([{ field: "startDate", code: "too_early" }]);
  }
  return from;
}

async function readPerson(tx: Tx, employeeId: string, from: CalendarDate): Promise<OwnWeekPerson> {
  const repository = workingPatternRepository(tx);
  const patterns = await repository.findPatterns();
  const name = ownPatternName(employeeId);
  const pattern =
    patterns.find((candidate) => !candidate.termsId && candidate.name === name) ?? null;
  const assignments = (await repository.findAssignments([employeeId])).get(employeeId) ?? [];
  const versionsOf = (id: string) =>
    patterns.find((candidate) => candidate.id === id)?.versions ?? [];
  const ownWeekOn = (date: CalendarDate) => {
    const row = assignments.find((candidate) => coversDate(candidate, date));
    return row ? (versionsOf(row.workingPatternId).find((v) => coversDate(v, date)) ?? null) : null;
  };
  return {
    tx,
    employeeId,
    from,
    pattern,
    assignments,
    ownWeekOn,
    firstOwnWeekAfter: () => {
      const next = assignments
        .filter(({ startDate }) => (startDate ?? "") > from)
        .toSorted((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))[0];
      return next?.startDate ? ownWeekOn(next.startDate) : null;
    },
    async createPattern(week) {
      const id = await repository.insertPattern({ name }, week);
      return (await repository.findPatterns()).find((candidate) => candidate.id === id)!;
    },
    async assign(workingPatternId) {
      const next = assignments
        .filter(({ startDate }) => (startDate ?? "") > from)
        .toSorted((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))[0];
      await repository.insertAssignment(employeeId, {
        workingPatternId,
        startDate: from,
        endDate: next?.startDate ? addDays(next.startDate, -1) : null,
      });
    },
  };
}

/**
 * Cancels whichever own-week change starts on the date: a new own week (its assignment), a change
 * to it (its version), or a return to the terms (the assignment ending the day before runs on).
 */
async function cancelChange(person: OwnWeekPerson, today: CalendarDate) {
  const { tx, from, assignments, pattern } = person;
  if (from <= today) throw started();
  const repository = workingPatternRepository(tx);
  const starting = assignments.find(({ startDate }) => startDate === from);
  const version = pattern?.versions.find(({ startDate }) => startDate === from);
  const returning = assignments.find(({ endDate }) => endDate === addDays(from, -1));
  if (starting) {
    await repository.deleteAssignment(starting.id);
  }
  if (version && pattern) {
    const { removed, extended } = cancelPlannedVersion(pattern.versions, from, today);
    await repository.deleteVersion(removed.id);
    if (extended) await repository.endVersion(extended.id, removed.endDate);
  }
  if (returning && !starting) {
    const next = assignments
      .filter(({ startDate }) => (startDate ?? "") >= from)
      .toSorted((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))[0];
    await repository.endAssignment(
      returning.id,
      next?.startDate ? addDays(next.startDate, -1) : null,
    );
  }
  if (!starting && !version && !returning) throw started();
  return {
    before: weekOf(starting || version ? person.ownWeekOn(from) : null),
    after: null,
    workingPatternId: pattern?.id ?? null,
    cancelled: true,
  };
}

/** The personal pattern's name, unique per person and never shown. */
function ownPatternName(employeeId: string): string {
  return `own:${employeeId}`;
}

function weekOf(
  version: Pick<PatternVersion, "minutes" | "bankHolidayCalendar"> | null,
): WeekValue {
  return version && { minutes: version.minutes, bankHolidayCalendar: version.bankHolidayCalendar };
}

function started(): ApplicationError {
  return new ApplicationError("CONFLICT", "This change has already started.");
}
