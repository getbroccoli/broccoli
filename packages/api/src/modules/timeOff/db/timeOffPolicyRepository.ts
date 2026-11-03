import { eq, inArray, isNull, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { AllowanceRule, DatedPolicyRow, TimeOffPolicy } from "../domain";
import { policyGroupTimeOffPolicies } from "./policyGroupTimeOffPoliciesTable";
import { timeOffAllowanceRules } from "./timeOffAllowanceRulesTable";
import { timeOffPolicies } from "./timeOffPoliciesTable";
import { timeOffPolicyAssignments } from "./timeOffPolicyAssignmentsTable";
import { timeOffTypes } from "./timeOffTypesTable";

/** Time off policies, who gets them and when, through the pool or inside a transaction. */
export interface TimeOffPolicyRepository {
  /** Every policy with its type and current rules, by type and name. */
  findAll(): Promise<TimeOffPolicy[]>;
  /** Serializes changes to groups' links until the transaction ends. */
  lockGroupLinks(): Promise<void>;
  /** Each group's links, by group id. */
  findGroupLinks(policyGroupIds: readonly string[]): Promise<Map<string, DatedPolicyRow[]>>;
  /** Links each policy to the group for its type, from the beginning and open-ended. */
  insertGroupLinks(
    policyGroupId: string,
    policies: readonly { timeOffTypeId: string; timeOffPolicyId: string }[],
  ): Promise<void>;
  deleteAllGroupLinks(): Promise<void>;
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

    async lockGroupLinks() {
      await orm().execute(
        sql`lock table ${policyGroupTimeOffPolicies} in share row exclusive mode`,
      );
    },

    async findGroupLinks(policyGroupIds) {
      const rows = await orm()
        .select()
        .from(policyGroupTimeOffPolicies)
        .where(inArray(policyGroupTimeOffPolicies.policyGroupId, [...policyGroupIds]));
      return Map.groupBy(rows, ({ policyGroupId }) => policyGroupId);
    },

    async insertGroupLinks(policyGroupId, policies) {
      await orm()
        .insert(policyGroupTimeOffPolicies)
        .values(policies.map((policy) => ({ policyGroupId, ...policy })));
    },

    async deleteAllGroupLinks() {
      await orm().delete(policyGroupTimeOffPolicies);
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
