import { asc, eq, inArray, isNotNull, sql } from "drizzle-orm";

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
  /** A new policy, one set of terms' or named, with one open version from the beginning. */
  insertPolicy(
    policy: { timeOffTypeId: string } & ({ termsId: string } | { name: string }),
    version: NewPolicyVersion,
  ): Promise<string>;
  /** Deletes every policy with its versions and rules; no allowance may point at a rule. */
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

    async insertPolicy(policy, { balance, bankHolidays, leaveYear, rules }) {
      const [inserted] = await orm()
        .insert(timeOffPolicies)
        .values(policy)
        .returning({ id: timeOffPolicies.id });
      const [version] = await orm()
        .insert(timeOffPolicyVersions)
        .values({
          timeOffPolicyId: inserted!.id,
          balance,
          bankHolidays,
          leaveYearStart: leaveYear?.kind ?? null,
          leaveYearStartMonth:
            leaveYear?.kind === "leave_year_from_fixed_date" ? leaveYear.month : null,
          leaveYearStartDay:
            leaveYear?.kind === "leave_year_from_fixed_date" ? leaveYear.day : null,
        })
        .returning({ id: timeOffPolicyVersions.id });
      if (rules.length > 0) {
        await orm()
          .insert(timeOffAllowanceRules)
          .values(rules.map((rule) => ruleRow(version!.id, rule)));
      }
      return inserted!.id;
    },

    async deleteAll() {
      await orm().delete(timeOffPolicies);
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
