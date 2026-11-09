import { asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { union } from "drizzle-orm/pg-core";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import type {
  DatedPattern,
  PatternVersion,
  PatternWeek,
  WeekdayMinutes,
  WorkingPattern,
} from "../domain";
import { employeeTerms } from "./employeeTermsTable";
import { employeeWorkingPatternAssignments } from "./employeeWorkingPatternAssignmentsTable";
import { workingPatterns } from "./workingPatternsTable";
import { workingPatternVersions } from "./workingPatternVersionsTable";

/** Working patterns, their versions, and the dated rows that put people on them. */
export interface WorkingPatternRepository {
  /** Holds back other working pattern writes until the transaction ends. */
  lockForWrites(): Promise<void>;
  /** Holds back working pattern writes, not reads, so several reads see one state. */
  lockForReads(): Promise<void>;
  /**
   * Every pattern with its versions, oldest first: named ones by name, then the terms'; with
   * `only`, just the patterns with those ids or that name.
   */
  findPatterns(only?: { ids: readonly string[]; name: string }): Promise<WorkingPattern[]>;
  /** A new pattern, named or one set of terms', with one version from the beginning, open unless `week` ends. */
  insertPattern(
    owner: { name: string } | { termsId: string },
    week: PatternWeek & { endDate?: CalendarDate | null },
  ): Promise<string>;
  renamePattern(id: string, name: string): Promise<void>;
  /** Deletes a pattern with its versions. */
  deletePattern(id: string): Promise<void>;
  /** Deletes every named pattern; no one may be on one. */
  deleteNamedPatterns(): Promise<void>;
  insertVersion(workingPatternId: string, version: Omit<PatternVersion, "id">): Promise<void>;
  /** Sets the last day of a version; null makes it open-ended. */
  endVersion(id: string, endDate: CalendarDate | null): Promise<void>;
  deleteVersion(id: string): Promise<void>;
  /** Replaces all of a pattern's versions with one open version from the beginning. */
  replaceVersions(workingPatternId: string, week: PatternWeek): Promise<void>;
  /** Whether a person is on the pattern on any date. */
  isPatternAssigned(workingPatternId: string): Promise<boolean>;
  /** The employees on the pattern on any date, themselves or through their terms. */
  findEmployeesOnPattern(workingPatternId: string): Promise<string[]>;
  /** Each employee's own dated patterns, by employee id. */
  findAssignments(employeeIds: readonly string[]): Promise<Map<string, DatedPattern[]>>;
  insertAssignment(
    employeeId: string,
    row: Omit<DatedPattern, "id" | "startDate"> & { startDate: CalendarDate },
  ): Promise<void>;
  endAssignment(id: string, endDate: CalendarDate): Promise<void>;
  deleteAssignment(id: string): Promise<void>;
}

export function workingPatternRepository(db: Orm | Tx): WorkingPatternRepository {
  const orm = () => ormOf(db);
  return {
    async lockForWrites() {
      await orm().execute(
        sql`lock table ${workingPatterns}, ${workingPatternVersions},
          ${employeeWorkingPatternAssignments} in share row exclusive mode`,
      );
    },

    async lockForReads() {
      await orm().execute(
        sql`lock table ${workingPatterns}, ${workingPatternVersions},
          ${employeeWorkingPatternAssignments} in share mode`,
      );
    },

    async findPatterns(only) {
      const rows = await orm()
        .select()
        .from(workingPatterns)
        .leftJoin(
          workingPatternVersions,
          eq(workingPatternVersions.workingPatternId, workingPatterns.id),
        )
        .where(
          only &&
            or(
              eq(workingPatterns.name, only.name),
              only.ids.length > 0 ? inArray(workingPatterns.id, [...only.ids]) : undefined,
            ),
        )
        .orderBy(
          sql`${workingPatterns.name} asc nulls last`,
          asc(workingPatterns.id),
          sql`${workingPatternVersions.startDate} asc nulls first`,
        );
      const patterns = new Map<string, WorkingPattern>();
      for (const { working_patterns: pattern, working_pattern_versions: version } of rows) {
        const found = patterns.get(pattern.id) ?? { ...pattern, versions: [] };
        patterns.set(pattern.id, {
          ...found,
          versions: version ? [...found.versions, patternVersionOf(version)] : found.versions,
        });
      }
      return [...patterns.values()];
    },

    async insertPattern(owner, { endDate = null, ...week }) {
      const [pattern] = await orm()
        .insert(workingPatterns)
        .values(owner)
        .returning({ id: workingPatterns.id });
      await orm()
        .insert(workingPatternVersions)
        .values(versionRow(pattern!.id, { ...week, startDate: null, endDate }));
      return pattern!.id;
    },

    async renamePattern(id, name) {
      await orm().update(workingPatterns).set({ name }).where(eq(workingPatterns.id, id));
    },

    async deletePattern(id) {
      await orm().delete(workingPatterns).where(eq(workingPatterns.id, id));
    },

    async deleteNamedPatterns() {
      await orm().delete(workingPatterns).where(isNotNull(workingPatterns.name));
    },

    async insertVersion(workingPatternId, version) {
      await orm().insert(workingPatternVersions).values(versionRow(workingPatternId, version));
    },

    async endVersion(id, endDate) {
      await orm()
        .update(workingPatternVersions)
        .set({ endDate })
        .where(eq(workingPatternVersions.id, id));
    },

    async deleteVersion(id) {
      await orm().delete(workingPatternVersions).where(eq(workingPatternVersions.id, id));
    },

    async replaceVersions(workingPatternId, week) {
      await orm()
        .delete(workingPatternVersions)
        .where(eq(workingPatternVersions.workingPatternId, workingPatternId));
      await orm()
        .insert(workingPatternVersions)
        .values(versionRow(workingPatternId, { ...week, startDate: null, endDate: null }));
    },

    async isPatternAssigned(workingPatternId) {
      const [assigned] = await orm()
        .select({ id: employeeWorkingPatternAssignments.id })
        .from(employeeWorkingPatternAssignments)
        .where(eq(employeeWorkingPatternAssignments.workingPatternId, workingPatternId))
        .limit(1);
      return assigned !== undefined;
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
          .innerJoin(workingPatterns, eq(workingPatterns.termsId, employeeTerms.termsId))
          .where(eq(workingPatterns.id, workingPatternId)),
      );
      return rows.map(({ employeeId }) => employeeId);
    },

    async findAssignments(employeeIds) {
      const rows = await orm()
        .select()
        .from(employeeWorkingPatternAssignments)
        .where(inArray(employeeWorkingPatternAssignments.employeeId, [...employeeIds]));
      const grouped = Map.groupBy(rows, ({ employeeId }) => employeeId);
      return new Map(
        [...grouped].map(([employeeId, assignments]) => [
          employeeId,
          assignments.map(({ id, workingPatternId, startDate, endDate }) => ({
            id,
            workingPatternId,
            startDate,
            endDate,
          })),
        ]),
      );
    },

    async insertAssignment(employeeId, { workingPatternId, startDate, endDate }) {
      await orm()
        .insert(employeeWorkingPatternAssignments)
        .values({ employeeId, workingPatternId, startDate, endDate });
    },

    async endAssignment(id, endDate) {
      await orm()
        .update(employeeWorkingPatternAssignments)
        .set({ endDate })
        .where(eq(employeeWorkingPatternAssignments.id, id));
    },

    async deleteAssignment(id) {
      await orm()
        .delete(employeeWorkingPatternAssignments)
        .where(eq(employeeWorkingPatternAssignments.id, id));
    },
  };
}

function patternVersionOf(row: typeof workingPatternVersions.$inferSelect): PatternVersion {
  return {
    id: row.id,
    startDate: row.startDate,
    endDate: row.endDate,
    minutes: [
      row.mondayMinutes,
      row.tuesdayMinutes,
      row.wednesdayMinutes,
      row.thursdayMinutes,
      row.fridayMinutes,
      row.saturdayMinutes,
      row.sundayMinutes,
    ] as WeekdayMinutes,
    bankHolidayCalendar: row.bankHolidayCalendar,
  };
}

function versionRow(workingPatternId: string, version: Omit<PatternVersion, "id">) {
  const [monday, tuesday, wednesday, thursday, friday, saturday, sunday] = version.minutes;
  return {
    workingPatternId,
    startDate: version.startDate,
    endDate: version.endDate,
    mondayMinutes: monday,
    tuesdayMinutes: tuesday,
    wednesdayMinutes: wednesday,
    thursdayMinutes: thursday,
    fridayMinutes: friday,
    saturdayMinutes: saturday,
    sundayMinutes: sunday,
    bankHolidayCalendar: version.bankHolidayCalendar,
  };
}
