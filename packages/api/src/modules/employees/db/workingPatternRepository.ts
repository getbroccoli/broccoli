import { and, asc, eq, inArray, isNotNull, notInArray, or, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import type {
  Assignment,
  AssignmentOwner,
  PatternVersion,
  PatternWeek,
  VersionStatus,
  WeekdayMinutes,
  WorkingPattern,
} from "../domain";
import { employeeTerms } from "./employeeTermsTable";
import { workingPatternAssignments } from "./workingPatternAssignmentsTable";
import { workingPatterns } from "./workingPatternsTable";
import { workingPatternVersions } from "./workingPatternVersionsTable";

/** Working patterns, their versions, and the dated assignments that give them to people and terms. */
export interface WorkingPatternRepository {
  /** Holds back other working pattern writes until the transaction ends. */
  lockForWrites(): Promise<void>;
  /** Holds back working pattern writes, not reads, so several reads see one state. */
  lockForReads(): Promise<void>;
  /** Every pattern with its versions, oldest first, drafts among them. */
  findPatterns(): Promise<WorkingPattern[]>;
  /** A new pattern without versions; returns its id. */
  insertPattern(name: string | null): Promise<string>;
  /** Deletes a pattern with its versions; none may be assigned. */
  deletePattern(id: string): Promise<void>;
  /** A new version, revision 1; returns its id. */
  insertVersion(
    workingPatternId: string,
    version: PatternWeek & { status: VersionStatus; termsId?: string | null },
  ): Promise<string>;
  /** New minutes and calendar on a draft, one revision later. */
  updateDraft(versionId: string, week: PatternWeek): Promise<void>;
  /** Makes a draft published, no longer any terms' draft. */
  publishVersion(versionId: string): Promise<void>;
  /** Deletes a version; none of its assignments may remain. */
  deleteVersion(versionId: string): Promise<void>;
  /** The assignments of these employees and terms, oldest first. */
  findAssignments(owners: {
    employeeIds?: readonly string[];
    termsIds?: readonly string[];
  }): Promise<Assignment[]>;
  /** The assignments of any of these versions, oldest first. */
  findAssignmentsOfVersions(versionIds: readonly string[]): Promise<Assignment[]>;
  /** The assignments with these ids. */
  findAssignmentsById(ids: readonly string[]): Promise<Assignment[]>;
  insertAssignment(row: Omit<Assignment, "id">): Promise<string>;
  /** Sets an assignment's last day; null makes it open-ended. */
  endAssignment(id: string, endDate: CalendarDate | null): Promise<void>;
  deleteAssignment(id: string): Promise<void>;
  /** Deletes the assignments of these terms. */
  deleteTermsAssignments(termsId: string): Promise<void>;
  /** Deletes the terms' unpublished versions, and the patterns they leave without versions. */
  deleteTermsDrafts(termsId: string): Promise<void>;
  /** Deletes every pattern no assignment uses, with its versions. */
  deleteUnassignedPatterns(): Promise<void>;
  /** The employees who may work one of the versions: theirs, or their terms' on some date. */
  findEmployeesOnVersions(versionIds: readonly string[]): Promise<string[]>;
}

export function workingPatternRepository(db: Orm | Tx): WorkingPatternRepository {
  const orm = () => ormOf(db);
  return {
    async lockForWrites() {
      await orm().execute(
        sql`lock table ${workingPatterns}, ${workingPatternVersions},
          ${workingPatternAssignments} in share row exclusive mode`,
      );
    },

    async lockForReads() {
      await orm().execute(
        sql`lock table ${workingPatterns}, ${workingPatternVersions},
          ${workingPatternAssignments} in share mode`,
      );
    },

    async findPatterns() {
      const patterns = await orm().select().from(workingPatterns).orderBy(asc(workingPatterns.id));
      const versions = await orm()
        .select()
        .from(workingPatternVersions)
        .orderBy(asc(workingPatternVersions.id));
      return patterns.map(({ id, name }) => ({
        id,
        name,
        versions: versions.filter((version) => version.workingPatternId === id).map(versionOf),
      }));
    },

    async insertPattern(name) {
      const [pattern] = await orm()
        .insert(workingPatterns)
        .values({ name })
        .returning({ id: workingPatterns.id });
      return pattern!.id;
    },

    async deletePattern(id) {
      await orm().delete(workingPatterns).where(eq(workingPatterns.id, id));
    },

    async insertVersion(workingPatternId, { status, termsId = null, ...week }) {
      const [version] = await orm()
        .insert(workingPatternVersions)
        .values({ workingPatternId, status, termsId, ...weekColumns(week) })
        .returning({ id: workingPatternVersions.id });
      return version!.id;
    },

    async updateDraft(versionId, week) {
      await orm()
        .update(workingPatternVersions)
        .set({ ...weekColumns(week), revision: sql`${workingPatternVersions.revision} + 1` })
        .where(eq(workingPatternVersions.id, versionId));
    },

    async publishVersion(versionId) {
      await orm()
        .update(workingPatternVersions)
        .set({ status: "published", termsId: null })
        .where(eq(workingPatternVersions.id, versionId));
    },

    async deleteVersion(versionId) {
      await orm().delete(workingPatternVersions).where(eq(workingPatternVersions.id, versionId));
    },

    async findAssignments({ employeeIds = [], termsIds = [] }) {
      if (employeeIds.length === 0 && termsIds.length === 0) {
        return [];
      }
      const rows = await orm()
        .select()
        .from(workingPatternAssignments)
        .where(
          or(
            employeeIds.length > 0
              ? inArray(workingPatternAssignments.employeeId, [...employeeIds])
              : undefined,
            termsIds.length > 0
              ? inArray(workingPatternAssignments.termsId, [...termsIds])
              : undefined,
          ),
        )
        .orderBy(asc(workingPatternAssignments.startDate));
      return rows.map(assignmentOf);
    },

    async findAssignmentsOfVersions(versionIds) {
      if (versionIds.length === 0) {
        return [];
      }
      const rows = await orm()
        .select()
        .from(workingPatternAssignments)
        .where(inArray(workingPatternAssignments.workingPatternVersionId, [...versionIds]))
        .orderBy(asc(workingPatternAssignments.startDate));
      return rows.map(assignmentOf);
    },

    async findAssignmentsById(ids) {
      const rows = await orm()
        .select()
        .from(workingPatternAssignments)
        .where(inArray(workingPatternAssignments.id, [...ids]));
      return rows.map(assignmentOf);
    },

    async insertAssignment({ versionId, owner, startDate, endDate }) {
      const [row] = await orm()
        .insert(workingPatternAssignments)
        .values({ workingPatternVersionId: versionId, ...ownerColumns(owner), startDate, endDate })
        .returning({ id: workingPatternAssignments.id });
      return row!.id;
    },

    async endAssignment(id, endDate) {
      await orm()
        .update(workingPatternAssignments)
        .set({ endDate })
        .where(eq(workingPatternAssignments.id, id));
    },

    async deleteAssignment(id) {
      await orm().delete(workingPatternAssignments).where(eq(workingPatternAssignments.id, id));
    },

    async deleteTermsAssignments(termsId) {
      await orm()
        .delete(workingPatternAssignments)
        .where(eq(workingPatternAssignments.termsId, termsId));
    },

    async deleteTermsDrafts(termsId) {
      const deleted = await orm()
        .delete(workingPatternVersions)
        .where(eq(workingPatternVersions.termsId, termsId))
        .returning({ patternId: workingPatternVersions.workingPatternId });
      if (deleted.length === 0) {
        return;
      }
      const kept = orm()
        .select({ id: workingPatternVersions.workingPatternId })
        .from(workingPatternVersions);
      await orm()
        .delete(workingPatterns)
        .where(
          and(
            inArray(
              workingPatterns.id,
              deleted.map(({ patternId }) => patternId),
            ),
            notInArray(workingPatterns.id, kept),
          ),
        );
    },

    async deleteUnassignedPatterns() {
      const assigned = orm()
        .select({ id: workingPatternVersions.workingPatternId })
        .from(workingPatternAssignments)
        .innerJoin(
          workingPatternVersions,
          eq(workingPatternVersions.id, workingPatternAssignments.workingPatternVersionId),
        );
      await orm().delete(workingPatterns).where(notInArray(workingPatterns.id, assigned));
    },

    async findEmployeesOnVersions(versionIds) {
      if (versionIds.length === 0) {
        return [];
      }
      const ofVersions = inArray(workingPatternAssignments.workingPatternVersionId, [
        ...versionIds,
      ]);
      const direct = await orm()
        .select({ employeeId: workingPatternAssignments.employeeId })
        .from(workingPatternAssignments)
        .where(and(ofVersions, isNotNull(workingPatternAssignments.employeeId)));
      const throughTerms = await orm()
        .select({ employeeId: employeeTerms.employeeId })
        .from(employeeTerms)
        .innerJoin(
          workingPatternAssignments,
          eq(workingPatternAssignments.termsId, employeeTerms.termsId),
        )
        .where(ofVersions);
      return [...new Set([...direct, ...throughTerms].map(({ employeeId }) => employeeId!))];
    },
  };
}

/** The owner columns of an assignment row: one set, the other null. */
export function ownerColumns(owner: AssignmentOwner) {
  // Both read as given, so the database refuses an owner that names both or neither.
  return {
    employeeId: "employeeId" in owner ? owner.employeeId : null,
    termsId: "termsId" in owner ? owner.termsId : null,
  };
}

/** The owner of an assignment row, which has exactly one. */
export function ownerOf(row: {
  employeeId: string | null;
  termsId: string | null;
}): AssignmentOwner {
  return row.employeeId !== null ? { employeeId: row.employeeId } : { termsId: row.termsId! };
}

function assignmentOf(row: typeof workingPatternAssignments.$inferSelect): Assignment {
  return {
    id: row.id,
    versionId: row.workingPatternVersionId,
    owner: ownerOf(row),
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

function versionOf(row: typeof workingPatternVersions.$inferSelect): PatternVersion {
  return {
    id: row.id,
    workingPatternId: row.workingPatternId,
    status: row.status,
    termsId: row.termsId,
    revision: row.revision,
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

function weekColumns({ minutes, bankHolidayCalendar }: PatternWeek) {
  const [monday, tuesday, wednesday, thursday, friday, saturday, sunday] = minutes;
  return {
    mondayMinutes: monday,
    tuesdayMinutes: tuesday,
    wednesdayMinutes: wednesday,
    thursdayMinutes: thursday,
    fridayMinutes: friday,
    saturdayMinutes: saturday,
    sundayMinutes: sunday,
    bankHolidayCalendar,
  };
}
