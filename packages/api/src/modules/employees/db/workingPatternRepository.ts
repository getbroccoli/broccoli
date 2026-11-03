import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { union } from "drizzle-orm/pg-core";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import type { DatedPattern, PatternWeek, WeekdayMinutes, WorkingPattern } from "../domain";
import { employeeTerms } from "./employeeTermsTable";
import { employeeWorkingPatternAssignments } from "./employeeWorkingPatternAssignmentsTable";
import { termsWorkingPatterns } from "./termsWorkingPatternsTable";
import { workingPatterns } from "./workingPatternsTable";
import { workingPatternWeeks } from "./workingPatternWeeksTable";

/** Working patterns, their weeks, and the dated rows that put terms and people on them. */
export interface WorkingPatternRepository {
  /** Holds back other working pattern writes until the transaction ends. */
  lockForWrites(): Promise<void>;
  /** Holds back working pattern writes, not reads, so several reads see one state. */
  lockForReads(): Promise<void>;
  /** Every pattern with its weeks, oldest first, by name. */
  findPatterns(): Promise<WorkingPattern[]>;
  /** A new pattern with one week from the beginning; returns its id. */
  insertPattern(name: string, week: Omit<PatternWeek, "effectiveFrom">): Promise<string>;
  renamePattern(id: string, name: string): Promise<void>;
  /** Deletes a pattern with its weeks. */
  deletePattern(id: string): Promise<void>;
  /** Saves a pattern's week from its date, replacing one that starts on it. */
  saveWeek(
    workingPatternId: string,
    week: PatternWeek & { effectiveFrom: CalendarDate },
  ): Promise<void>;
  /** Deletes the pattern's week that starts on `from`; false when there is none. */
  deleteWeek(workingPatternId: string, from: CalendarDate): Promise<boolean>;
  /** Whether terms or a person are on the pattern on any date. */
  isPatternUsed(workingPatternId: string): Promise<boolean>;
  /** The employees on the pattern on any date, themselves or through their terms. */
  findEmployeesOnPattern(workingPatternId: string): Promise<string[]>;
  /** Each terms' dated patterns, by terms id. */
  findTermsLinks(termsIds: readonly string[]): Promise<Map<string, DatedPattern[]>>;
  /** Each employee's own dated patterns, by employee id. */
  findAssignments(employeeIds: readonly string[]): Promise<Map<string, DatedPattern[]>>;
  insertTermsLink(termsId: string, row: Omit<DatedPattern, "id">): Promise<void>;
  insertAssignment(
    employeeId: string,
    row: Omit<DatedPattern, "id" | "effectiveFrom"> & { effectiveFrom: CalendarDate },
  ): Promise<void>;
  endTermsLink(id: string, until: CalendarDate): Promise<void>;
  endAssignment(id: string, until: CalendarDate): Promise<void>;
  deleteTermsLink(id: string): Promise<void>;
  deleteAssignment(id: string): Promise<void>;
}

export function workingPatternRepository(db: Orm | Tx): WorkingPatternRepository {
  const orm = () => ormOf(db);
  return {
    async lockForWrites() {
      await orm().execute(
        sql`lock table ${workingPatternWeeks}, ${termsWorkingPatterns},
          ${employeeWorkingPatternAssignments} in share row exclusive mode`,
      );
    },

    async lockForReads() {
      await orm().execute(
        sql`lock table ${workingPatternWeeks}, ${termsWorkingPatterns},
          ${employeeWorkingPatternAssignments} in share mode`,
      );
    },

    async findPatterns() {
      const rows = await orm()
        .select()
        .from(workingPatterns)
        .leftJoin(workingPatternWeeks, eq(workingPatternWeeks.workingPatternId, workingPatterns.id))
        .orderBy(
          asc(workingPatterns.name),
          sql`${workingPatternWeeks.effectiveFrom} asc nulls first`,
        );
      const patterns = new Map<string, WorkingPattern>();
      for (const { working_patterns: pattern, working_pattern_weeks: week } of rows) {
        const found = patterns.get(pattern.id) ?? {
          id: pattern.id,
          name: pattern.name,
          isStandard: pattern.key === "standard_working_pattern",
          weeks: [],
        };
        patterns.set(pattern.id, {
          ...found,
          weeks: week ? [...found.weeks, patternWeekOf(week)] : found.weeks,
        });
      }
      return [...patterns.values()];
    },

    async insertPattern(name, week) {
      const [pattern] = await orm()
        .insert(workingPatterns)
        .values({ name })
        .returning({ id: workingPatterns.id });
      await orm()
        .insert(workingPatternWeeks)
        .values(weekRow(pattern!.id, { ...week, effectiveFrom: null }));
      return pattern!.id;
    },

    async renamePattern(id, name) {
      await orm().update(workingPatterns).set({ name }).where(eq(workingPatterns.id, id));
    },

    async deletePattern(id) {
      await orm().delete(workingPatterns).where(eq(workingPatterns.id, id));
    },

    async saveWeek(workingPatternId, week) {
      const row = weekRow(workingPatternId, week);
      await orm()
        .insert(workingPatternWeeks)
        .values(row)
        .onConflictDoUpdate({
          target: [workingPatternWeeks.workingPatternId, workingPatternWeeks.effectiveFrom],
          set: row,
        });
    },

    async deleteWeek(workingPatternId, from) {
      const deleted = await orm()
        .delete(workingPatternWeeks)
        .where(
          and(
            eq(workingPatternWeeks.workingPatternId, workingPatternId),
            eq(workingPatternWeeks.effectiveFrom, from),
          ),
        )
        .returning({ id: workingPatternWeeks.id });
      return deleted.length > 0;
    },

    async isPatternUsed(workingPatternId) {
      const [byTerms] = await orm()
        .select({ id: termsWorkingPatterns.id })
        .from(termsWorkingPatterns)
        .where(eq(termsWorkingPatterns.workingPatternId, workingPatternId))
        .limit(1);
      const [byPerson] = await orm()
        .select({ id: employeeWorkingPatternAssignments.id })
        .from(employeeWorkingPatternAssignments)
        .where(eq(employeeWorkingPatternAssignments.workingPatternId, workingPatternId))
        .limit(1);
      return byTerms !== undefined || byPerson !== undefined;
    },

    async findEmployeesOnPattern(workingPatternId) {
      const rows = await union(
        orm()
          .select({ employeeId: employeeWorkingPatternAssignments.employeeId })
          .from(employeeWorkingPatternAssignments)
          .where(eq(employeeWorkingPatternAssignments.workingPatternId, workingPatternId)),
        orm()
          .select({ employeeId: employeeTerms.employeeId })
          .from(employeeTerms)
          .innerJoin(termsWorkingPatterns, eq(termsWorkingPatterns.termsId, employeeTerms.termsId))
          .where(eq(termsWorkingPatterns.workingPatternId, workingPatternId)),
      );
      return rows.map(({ employeeId }) => employeeId);
    },

    async findTermsLinks(termsIds) {
      const table = termsWorkingPatterns;
      const rows = await orm()
        .select()
        .from(table)
        .where(inArray(table.termsId, [...termsIds]));
      return groupBy(rows, ({ termsId }) => termsId);
    },

    async findAssignments(employeeIds) {
      const table = employeeWorkingPatternAssignments;
      const rows = await orm()
        .select()
        .from(table)
        .where(inArray(table.employeeId, [...employeeIds]));
      return groupBy(rows, ({ employeeId }) => employeeId);
    },

    async insertTermsLink(termsId, row) {
      await orm()
        .insert(termsWorkingPatterns)
        .values({ termsId, workingPatternId: row.workingPatternId, ...datesOf(row) });
    },

    async insertAssignment(employeeId, row) {
      await orm().insert(employeeWorkingPatternAssignments).values({
        employeeId,
        workingPatternId: row.workingPatternId,
        effectiveFrom: row.effectiveFrom,
        effectiveUntil: row.effectiveUntil,
      });
    },

    async endTermsLink(id, until) {
      await orm()
        .update(termsWorkingPatterns)
        .set({ effectiveUntil: until })
        .where(eq(termsWorkingPatterns.id, id));
    },

    async endAssignment(id, until) {
      await orm()
        .update(employeeWorkingPatternAssignments)
        .set({ effectiveUntil: until })
        .where(eq(employeeWorkingPatternAssignments.id, id));
    },

    async deleteTermsLink(id) {
      await orm().delete(termsWorkingPatterns).where(eq(termsWorkingPatterns.id, id));
    },

    async deleteAssignment(id) {
      await orm()
        .delete(employeeWorkingPatternAssignments)
        .where(eq(employeeWorkingPatternAssignments.id, id));
    },
  };
}

type WeekRow = typeof workingPatternWeeks.$inferSelect;

type DatedRow = Pick<DatedPattern, "id" | "effectiveFrom" | "effectiveUntil"> & {
  workingPatternId: string;
};

function patternWeekOf(row: WeekRow): PatternWeek {
  return {
    effectiveFrom: row.effectiveFrom,
    minutes: [
      row.mondayMinutes,
      row.tuesdayMinutes,
      row.wednesdayMinutes,
      row.thursdayMinutes,
      row.fridayMinutes,
      row.saturdayMinutes,
      row.sundayMinutes,
    ] as WeekdayMinutes,
    fullDayMinutes: row.fullDayMinutes,
    bankHolidayCalendar: row.bankHolidayCalendar,
  };
}

function weekRow(workingPatternId: string, week: PatternWeek) {
  const [monday, tuesday, wednesday, thursday, friday, saturday, sunday] = week.minutes;
  return {
    workingPatternId,
    effectiveFrom: week.effectiveFrom,
    mondayMinutes: monday,
    tuesdayMinutes: tuesday,
    wednesdayMinutes: wednesday,
    thursdayMinutes: thursday,
    fridayMinutes: friday,
    saturdayMinutes: saturday,
    sundayMinutes: sunday,
    fullDayMinutes: week.fullDayMinutes,
    bankHolidayCalendar: week.bankHolidayCalendar,
  };
}

function datesOf<Dates extends Pick<DatedPattern, "effectiveFrom" | "effectiveUntil">>(row: Dates) {
  return { effectiveFrom: row.effectiveFrom, effectiveUntil: row.effectiveUntil };
}

function groupBy<Row extends DatedRow>(
  rows: readonly Row[],
  keyOf: (row: Row) => string,
): Map<string, DatedPattern[]> {
  const grouped = new Map<string, DatedPattern[]>();
  for (const row of rows) {
    const dated = {
      id: row.id,
      workingPatternId: row.workingPatternId,
      ...datesOf(row),
    };
    grouped.set(keyOf(row), [...(grouped.get(keyOf(row)) ?? []), dated]);
  }
  return grouped;
}
