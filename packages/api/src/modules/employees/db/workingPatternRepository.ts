import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import type { DatedPolicy, PatternWeek, WeekdayMinutes, WorkingPatternPolicy } from "../domain";
import { employeePolicyGroups } from "./employeePolicyGroupsTable";
import { employeeWorkingPatternAssignments } from "./employeeWorkingPatternAssignmentsTable";
import { policyGroupWorkingPatterns } from "./policyGroupWorkingPatternsTable";
import { workingPatternPolicies } from "./workingPatternPoliciesTable";
import { workingPatternWeeks } from "./workingPatternWeeksTable";

/** Working pattern policies, their weeks, and the dated rows that put groups and people on them. */
export interface WorkingPatternRepository {
  /** Holds back other working pattern writes until the transaction ends. */
  lockForWrites(): Promise<void>;
  /** Every policy with its weeks, oldest first, by name. */
  findPolicies(): Promise<WorkingPatternPolicy[]>;
  /** A new policy with one week from the beginning; returns its id. */
  insertPolicy(name: string, week: Omit<PatternWeek, "effectiveFrom">): Promise<string>;
  renamePolicy(id: string, name: string): Promise<void>;
  /** Deletes a policy with its weeks. */
  deletePolicy(id: string): Promise<void>;
  /** Saves a policy's week from its date, replacing one that starts on it. */
  saveWeek(policyId: string, week: PatternWeek & { effectiveFrom: CalendarDate }): Promise<void>;
  /** Deletes the policy's week that starts on `from`; false when there is none. */
  deleteWeek(policyId: string, from: CalendarDate): Promise<boolean>;
  /** Whether a group or a person is on the policy on any date. */
  isPolicyUsed(policyId: string): Promise<boolean>;
  /** The employees on the policy on any date, themselves or through a group. */
  findEmployeesOnPolicy(policyId: string): Promise<string[]>;
  /** Each group's dated policies, by group id; every group's without ids. */
  findGroupPolicies(groupIds?: readonly string[]): Promise<Map<string, DatedPolicy[]>>;
  /** Each employee's own dated policies, by employee id. */
  findAssignments(employeeIds: readonly string[]): Promise<Map<string, DatedPolicy[]>>;
  insertGroupPolicy(groupId: string, row: Omit<DatedPolicy, "id">): Promise<void>;
  insertAssignment(
    employeeId: string,
    row: Omit<DatedPolicy, "id" | "effectiveFrom"> & { effectiveFrom: CalendarDate },
  ): Promise<void>;
  endGroupPolicy(id: string, until: CalendarDate): Promise<void>;
  endAssignment(id: string, until: CalendarDate): Promise<void>;
  deleteGroupPolicy(id: string): Promise<void>;
  deleteAssignment(id: string): Promise<void>;
}

export function workingPatternRepository(db: Orm | Tx): WorkingPatternRepository {
  const orm = () => ormOf(db);
  return {
    async lockForWrites() {
      await orm().execute(
        sql`lock table ${workingPatternWeeks}, ${policyGroupWorkingPatterns},
          ${employeeWorkingPatternAssignments} in share row exclusive mode`,
      );
    },

    async findPolicies() {
      const policies = await orm()
        .select()
        .from(workingPatternPolicies)
        .orderBy(asc(workingPatternPolicies.name));
      const weeks = await orm()
        .select()
        .from(workingPatternWeeks)
        .orderBy(sql`${workingPatternWeeks.effectiveFrom} asc nulls first`);
      return policies.map(({ id, name, key }) => ({
        id,
        name,
        isStandard: key === "standard_working_pattern",
        weeks: weeks.filter((week) => week.workingPatternPolicyId === id).map(patternWeekOf),
      }));
    },

    async insertPolicy(name, week) {
      const [policy] = await orm()
        .insert(workingPatternPolicies)
        .values({ name })
        .returning({ id: workingPatternPolicies.id });
      await orm()
        .insert(workingPatternWeeks)
        .values(weekRow(policy!.id, { ...week, effectiveFrom: null }));
      return policy!.id;
    },

    async renamePolicy(id, name) {
      await orm()
        .update(workingPatternPolicies)
        .set({ name })
        .where(eq(workingPatternPolicies.id, id));
    },

    async deletePolicy(id) {
      await orm().delete(workingPatternPolicies).where(eq(workingPatternPolicies.id, id));
    },

    async saveWeek(policyId, week) {
      const row = weekRow(policyId, week);
      await orm()
        .insert(workingPatternWeeks)
        .values(row)
        .onConflictDoUpdate({
          target: [workingPatternWeeks.workingPatternPolicyId, workingPatternWeeks.effectiveFrom],
          set: row,
        });
    },

    async deleteWeek(policyId, from) {
      const deleted = await orm()
        .delete(workingPatternWeeks)
        .where(
          and(
            eq(workingPatternWeeks.workingPatternPolicyId, policyId),
            eq(workingPatternWeeks.effectiveFrom, from),
          ),
        )
        .returning({ id: workingPatternWeeks.id });
      return deleted.length > 0;
    },

    async isPolicyUsed(policyId) {
      const { rows } = await orm().execute<{ used: boolean }>(
        sql`select exists (select 1 from ${policyGroupWorkingPatterns}
            where ${policyGroupWorkingPatterns.workingPatternPolicyId} = ${policyId})
          or exists (select 1 from ${employeeWorkingPatternAssignments}
            where ${employeeWorkingPatternAssignments.workingPatternPolicyId} = ${policyId}) as used`,
      );
      return rows[0]!.used;
    },

    async findEmployeesOnPolicy(policyId) {
      const { rows } = await orm().execute<{ employee_id: string }>(
        sql`select ${employeeWorkingPatternAssignments.employeeId} as employee_id
          from ${employeeWorkingPatternAssignments}
          where ${employeeWorkingPatternAssignments.workingPatternPolicyId} = ${policyId}
          union
          select ${employeePolicyGroups.employeeId} from ${employeePolicyGroups}
          join ${policyGroupWorkingPatterns}
            on ${policyGroupWorkingPatterns.policyGroupId} = ${employeePolicyGroups.policyGroupId}
          where ${policyGroupWorkingPatterns.workingPatternPolicyId} = ${policyId}`,
      );
      return rows.map(({ employee_id }) => employee_id);
    },

    async findGroupPolicies(groupIds) {
      const table = policyGroupWorkingPatterns;
      const rows = await orm()
        .select()
        .from(table)
        .where(groupIds ? inArray(table.policyGroupId, [...groupIds]) : undefined);
      return groupBy(rows, ({ policyGroupId }) => policyGroupId);
    },

    async findAssignments(employeeIds) {
      const table = employeeWorkingPatternAssignments;
      const rows = await orm()
        .select()
        .from(table)
        .where(inArray(table.employeeId, [...employeeIds]));
      return groupBy(rows, ({ employeeId }) => employeeId);
    },

    async insertGroupPolicy(policyGroupId, row) {
      await orm()
        .insert(policyGroupWorkingPatterns)
        .values({ policyGroupId, workingPatternPolicyId: row.policyId, ...datesOf(row) });
    },

    async insertAssignment(employeeId, row) {
      await orm().insert(employeeWorkingPatternAssignments).values({
        employeeId,
        workingPatternPolicyId: row.policyId,
        effectiveFrom: row.effectiveFrom,
        effectiveUntil: row.effectiveUntil,
      });
    },

    async endGroupPolicy(id, until) {
      await orm()
        .update(policyGroupWorkingPatterns)
        .set({ effectiveUntil: until })
        .where(eq(policyGroupWorkingPatterns.id, id));
    },

    async endAssignment(id, until) {
      await orm()
        .update(employeeWorkingPatternAssignments)
        .set({ effectiveUntil: until })
        .where(eq(employeeWorkingPatternAssignments.id, id));
    },

    async deleteGroupPolicy(id) {
      await orm().delete(policyGroupWorkingPatterns).where(eq(policyGroupWorkingPatterns.id, id));
    },

    async deleteAssignment(id) {
      await orm()
        .delete(employeeWorkingPatternAssignments)
        .where(eq(employeeWorkingPatternAssignments.id, id));
    },
  };
}

type WeekRow = typeof workingPatternWeeks.$inferSelect;

type DatedRow = Pick<DatedPolicy, "id" | "effectiveFrom" | "effectiveUntil"> & {
  workingPatternPolicyId: string;
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
  };
}

function weekRow(workingPatternPolicyId: string, week: PatternWeek) {
  const [monday, tuesday, wednesday, thursday, friday, saturday, sunday] = week.minutes;
  return {
    workingPatternPolicyId,
    effectiveFrom: week.effectiveFrom,
    mondayMinutes: monday,
    tuesdayMinutes: tuesday,
    wednesdayMinutes: wednesday,
    thursdayMinutes: thursday,
    fridayMinutes: friday,
    saturdayMinutes: saturday,
    sundayMinutes: sunday,
    fullDayMinutes: week.fullDayMinutes,
  };
}

function datesOf<Dates extends Pick<DatedPolicy, "effectiveFrom" | "effectiveUntil">>(row: Dates) {
  return { effectiveFrom: row.effectiveFrom, effectiveUntil: row.effectiveUntil };
}

function groupBy<Row extends DatedRow>(
  rows: readonly Row[],
  keyOf: (row: Row) => string,
): Map<string, DatedPolicy[]> {
  const grouped = new Map<string, DatedPolicy[]>();
  for (const row of rows) {
    const dated = {
      id: row.id,
      policyId: row.workingPatternPolicyId,
      ...datesOf(row),
    };
    grouped.set(keyOf(row), [...(grouped.get(keyOf(row)) ?? []), dated]);
  }
  return grouped;
}
