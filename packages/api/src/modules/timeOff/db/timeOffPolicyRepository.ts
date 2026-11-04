import { eq, inArray, isNull, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { AllowanceRule, DatedPolicyRow, TimeOffPolicy } from "../domain";
import { termsTimeOffPolicies } from "./termsTimeOffPoliciesTable";
import { timeOffAllowanceRules } from "./timeOffAllowanceRulesTable";
import { timeOffPolicies } from "./timeOffPoliciesTable";
import { timeOffPolicyAssignments } from "./timeOffPolicyAssignmentsTable";
import { timeOffTypes } from "./timeOffTypesTable";

/** Time off policies, who gets them and when, through the pool or inside a transaction. */
export interface TimeOffPolicyRepository {
  /** Every policy with its type and current rules, by type and name. */
  findAll(): Promise<TimeOffPolicy[]>;
  /** Serializes changes to terms' links until the transaction ends. */
  lockTermsLinks(): Promise<void>;
  /** Policy links, by terms id. */
  findTermsLinks(termsIds: readonly string[]): Promise<Map<string, DatedPolicyRow[]>>;
  /** Links each policy to the terms for its type, from the beginning and open-ended. */
  insertTermsLinks(
    termsId: string,
    policies: readonly { timeOffTypeId: string; timeOffPolicyId: string }[],
  ): Promise<void>;
  /** Whether any terms have a time off policy: whether leave is on. */
  hasAnyTermsLinks(): Promise<boolean>;
  deleteAllTermsLinks(): Promise<void>;
  /** Each employee's own policies, by employee id. */
  findAssignments(employeeIds: readonly string[]): Promise<Map<string, DatedPolicyRow[]>>;
}

export function timeOffPolicyRepository(db: Orm | Tx): TimeOffPolicyRepository {
  const orm = () => ormOf(db);
  return {
    async findAll() {
      const policies = await orm()
        .select({ policy: timeOffPolicies, type: timeOffTypes })
        .from(timeOffPolicies)
        .innerJoin(timeOffTypes, eq(timeOffTypes.id, timeOffPolicies.timeOffTypeId))
        .orderBy(timeOffTypes.name, timeOffPolicies.name);
      const rules = await orm()
        .select()
        .from(timeOffAllowanceRules)
        .where(isNull(timeOffAllowanceRules.removedAt));
      return policies.map(({ policy, type }) => ({
        id: policy.id,
        name: policy.name,
        key: policy.key,
        timeOffType: { id: type.id, name: type.name, typeKey: type.typeKey },
        balance: policy.balance,
        bankHolidays: policy.bankHolidays,
        leaveYear:
          policy.leaveYearStart === "leave_year_from_fixed_date"
            ? {
                kind: policy.leaveYearStart,
                month: policy.leaveYearStartMonth!,
                day: policy.leaveYearStartDay!,
              }
            : policy.leaveYearStart && { kind: policy.leaveYearStart },
        rules: rules.filter((rule) => rule.timeOffPolicyId === policy.id).map(toRule),
      }));
    },

    async lockTermsLinks() {
      await orm().execute(sql`lock table ${termsTimeOffPolicies} in share row exclusive mode`);
    },

    async findTermsLinks(termsIds) {
      const rows = await orm()
        .select()
        .from(termsTimeOffPolicies)
        .where(inArray(termsTimeOffPolicies.termsId, [...termsIds]));
      return Map.groupBy(rows, ({ termsId }) => termsId);
    },

    async insertTermsLinks(termsId, policies) {
      await orm()
        .insert(termsTimeOffPolicies)
        .values(policies.map((policy) => ({ termsId, ...policy })));
    },

    async hasAnyTermsLinks() {
      const [link] = await orm()
        .select({ id: termsTimeOffPolicies.id })
        .from(termsTimeOffPolicies)
        .limit(1);
      return link !== undefined;
    },

    async deleteAllTermsLinks() {
      await orm().delete(termsTimeOffPolicies);
    },

    async findAssignments(employeeIds) {
      const rows = await orm()
        .select()
        .from(timeOffPolicyAssignments)
        .where(inArray(timeOffPolicyAssignments.employeeId, [...employeeIds]));
      return Map.groupBy(rows, ({ employeeId }) => employeeId);
    },
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
