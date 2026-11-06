import { asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import type {
  AllowanceRule,
  NewPolicyVersion,
  PolicyVersion,
  TimeOffPolicy,
  TimeOffType,
} from "../domain";
import { timeOffAllowanceRules } from "./timeOffAllowanceRulesTable";
import { timeOffPolicies } from "./timeOffPoliciesTable";
import { timeOffPolicyAssignments } from "./timeOffPolicyAssignmentsTable";
import { timeOffPolicyVersions } from "./timeOffPolicyVersionsTable";
import { timeOffTypes } from "./timeOffTypesTable";

/** A person on a named policy for one type from a date to a date. */
export interface PolicyAssignment {
  timeOffTypeId: string;
  timeOffPolicyId: string;
  startDate: CalendarDate;
  /** The last day; null: open-ended. */
  endDate: CalendarDate | null;
}

/** Time off types and policies, and who is on which named policy when, through the pool or a transaction. */
export interface TimeOffPolicyRepository {
  /** Every time off type, with or without a policy. */
  findAllTypes(): Promise<TimeOffType[]>;
  /** Every policy with its type and versions, oldest first, each with its rules. */
  findAll(): Promise<TimeOffPolicy[]>;
  /** Serializes changes to policies until the transaction ends. */
  lockPolicies(): Promise<void>;
  /** Whether any terms have a time off policy: whether time off is on. */
  hasAnyTermsPolicies(): Promise<boolean>;
  /** A new policy, one set of terms' or named, with one open version from `version.startDate`, or the beginning. */
  insertPolicy(
    policy: { timeOffTypeId: string } & ({ termsId: string } | { name: string }),
    version: NewPolicyVersion & { startDate?: CalendarDate },
  ): Promise<string>;
  /** Deletes a policy with its versions; their rules stay for the ledger lines granted from them. */
  deletePolicy(id: string): Promise<void>;
  insertVersion(
    timeOffPolicyId: string,
    version: NewPolicyVersion & { startDate: CalendarDate; endDate: CalendarDate | null },
  ): Promise<void>;
  /** Sets the last day of a version; null makes it open-ended. */
  endVersion(id: string, endDate: CalendarDate | null): Promise<void>;
  /** Deletes a version; its rules stay for the ledger lines granted from them. */
  deleteVersion(id: string): Promise<void>;
  /** The employees put on the policy on any date. */
  findAssignedEmployees(timeOffPolicyId: string): Promise<string[]>;
  /** Deletes every policy with its versions and rules, also removed versions' rules; no ledger line or assignment may point at one. */
  deleteAll(): Promise<void>;
  /** Each employee's named policies, by employee id. */
  findAssignments(employeeIds: readonly string[]): Promise<Map<string, PolicyAssignment[]>>;
}

export function timeOffPolicyRepository(db: Orm | Tx): TimeOffPolicyRepository {
  const orm = () => ormOf(db);
  return {
    async findAllTypes() {
      return (await orm().select().from(timeOffTypes)).map(toTimeOffType);
    },

    async findAll() {
      const policies = await orm()
        .select({ policy: timeOffPolicies, type: timeOffTypes })
        .from(timeOffPolicies)
        .innerJoin(timeOffTypes, eq(timeOffTypes.id, timeOffPolicies.timeOffTypeId))
        .orderBy(asc(timeOffPolicies.id));
      const versions = await orm()
        .select()
        .from(timeOffPolicyVersions)
        .orderBy(sql`${timeOffPolicyVersions.startDate} asc nulls first`);
      const rules = await orm().select().from(timeOffAllowanceRules);
      return policies.map(({ policy, type }) => ({
        id: policy.id,
        timeOffType: toTimeOffType(type),
        termsId: policy.termsId,
        name: policy.name,
        versions: versions
          .filter((version) => version.timeOffPolicyId === policy.id)
          .map((version) => toVersion(version, rules)),
      }));
    },

    async lockPolicies() {
      await orm().execute(sql`lock table ${timeOffPolicies} in share row exclusive mode`);
    },

    async hasAnyTermsPolicies() {
      const [policy] = await orm()
        .select({ id: timeOffPolicies.id })
        .from(timeOffPolicies)
        .where(isNotNull(timeOffPolicies.termsId))
        .limit(1);
      return policy !== undefined;
    },

    async insertPolicy(policy, { startDate = null, ...version }) {
      const [inserted] = await orm()
        .insert(timeOffPolicies)
        .values(policy)
        .returning({ id: timeOffPolicies.id });
      await insertVersionRows(db, inserted!.id, { ...version, startDate, endDate: null });
      return inserted!.id;
    },

    async deletePolicy(id) {
      await orm().delete(timeOffPolicies).where(eq(timeOffPolicies.id, id));
    },

    insertVersion: (timeOffPolicyId, version) => insertVersionRows(db, timeOffPolicyId, version),

    async endVersion(id, endDate) {
      await orm()
        .update(timeOffPolicyVersions)
        .set({ endDate })
        .where(eq(timeOffPolicyVersions.id, id));
    },

    async deleteVersion(id) {
      await orm().delete(timeOffPolicyVersions).where(eq(timeOffPolicyVersions.id, id));
    },

    async findAssignedEmployees(timeOffPolicyId) {
      const rows = await orm()
        .selectDistinct({ employeeId: timeOffPolicyAssignments.employeeId })
        .from(timeOffPolicyAssignments)
        .where(eq(timeOffPolicyAssignments.timeOffPolicyId, timeOffPolicyId));
      return rows.map(({ employeeId }) => employeeId);
    },

    async deleteAll() {
      await orm().delete(timeOffPolicies);
      await orm()
        .delete(timeOffAllowanceRules)
        .where(isNull(timeOffAllowanceRules.timeOffPolicyVersionId));
    },

    async findAssignments(employeeIds) {
      const rows = await orm()
        .select()
        .from(timeOffPolicyAssignments)
        .where(inArray(timeOffPolicyAssignments.employeeId, [...employeeIds]));
      return new Map(
        [...Map.groupBy(rows, ({ employeeId }) => employeeId)].map(([employeeId, assignments]) => [
          employeeId,
          assignments.map(({ timeOffTypeId, timeOffPolicyId, startDate, endDate }) => ({
            timeOffTypeId,
            timeOffPolicyId,
            startDate,
            endDate,
          })),
        ]),
      );
    },
  };
}

async function insertVersionRows(
  db: Orm | Tx,
  timeOffPolicyId: string,
  {
    startDate,
    endDate,
    balance,
    bankHolidays,
    leaveYear,
    rules,
  }: NewPolicyVersion & { startDate: CalendarDate | null; endDate: CalendarDate | null },
) {
  const [version] = await ormOf(db)
    .insert(timeOffPolicyVersions)
    .values({
      timeOffPolicyId,
      startDate,
      endDate,
      balance,
      bankHolidays,
      leaveYearStart: leaveYear?.kind ?? null,
      leaveYearStartMonth:
        leaveYear?.kind === "leave_year_from_fixed_date" ? leaveYear.month : null,
      leaveYearStartDay: leaveYear?.kind === "leave_year_from_fixed_date" ? leaveYear.day : null,
    })
    .returning({ id: timeOffPolicyVersions.id });
  if (rules.length > 0) {
    await ormOf(db)
      .insert(timeOffAllowanceRules)
      .values(rules.map((rule) => ruleRow(version!.id, rule)));
  }
}

function toVersion(
  row: typeof timeOffPolicyVersions.$inferSelect,
  rules: readonly (typeof timeOffAllowanceRules.$inferSelect)[],
): PolicyVersion {
  return {
    id: row.id,
    startDate: row.startDate,
    endDate: row.endDate,
    balance: row.balance,
    bankHolidays: row.bankHolidays,
    leaveYear:
      row.leaveYearStart === "leave_year_from_fixed_date"
        ? { kind: row.leaveYearStart, month: row.leaveYearStartMonth!, day: row.leaveYearStartDay! }
        : row.leaveYearStart && { kind: row.leaveYearStart },
    rules: rules.filter((rule) => rule.timeOffPolicyVersionId === row.id).map(toRule),
  };
}

function toRule(row: typeof timeOffAllowanceRules.$inferSelect): AllowanceRule {
  return row.kind === "yearly_entitlement"
    ? {
        id: row.id,
        kind: row.kind,
        entitlementDays: Number(row.entitlementDays),
        entitlementDaysPerWeek: row.entitlementDaysPerWeek!,
        maxDays: row.maxDays === null ? null : Number(row.maxDays),
      }
    : {
        id: row.id,
        kind: row.kind,
        afterYears: row.afterYears!,
        extraDays: Number(row.extraDays),
      };
}

function ruleRow(timeOffPolicyVersionId: string, rule: NewPolicyVersion["rules"][number]) {
  return rule.kind === "yearly_entitlement"
    ? {
        timeOffPolicyVersionId,
        kind: rule.kind,
        entitlementDays: String(rule.entitlementDays),
        entitlementDaysPerWeek: rule.entitlementDaysPerWeek,
        maxDays: rule.maxDays === null ? null : String(rule.maxDays),
      }
    : {
        timeOffPolicyVersionId,
        kind: rule.kind,
        afterYears: rule.afterYears,
        extraDays: String(rule.extraDays),
      };
}

function toTimeOffType({ id, name, typeKey, icon, colour }: typeof timeOffTypes.$inferSelect) {
  return { id, name, typeKey, icon, colour };
}
