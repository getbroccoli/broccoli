import { and, eq, isNull, sql } from "drizzle-orm";

import { ormOf, type Tx } from "../../../core/db";
import type { TimeOffPolicy, TimeOffTypeColour, TimeOffTypeIcon } from "../domain";
import { allowanceLedgerLines } from "./allowanceLedgerLinesTable";
import { allowances } from "./allowancesTable";
import { timeOffAllowanceRules } from "./timeOffAllowanceRulesTable";
import { timeOffPolicies } from "./timeOffPoliciesTable";
import { timeOffTypes } from "./timeOffTypesTable";

/** The rules of a policy as Settings writes them; null leaves out the yearly allowance. */
export interface PolicyValues {
  name: string;
  balance: TimeOffPolicy["balance"];
  bankHolidays: TimeOffPolicy["bankHolidays"];
  leaveYear: TimeOffPolicy["leaveYear"];
}

/** A yearly allowance rule's amounts. */
export interface YearlyEntitlement {
  entitlementDays: number;
  entitlementDaysPerWeek: number;
  maxDays: number | null;
}

/** Writes to time off types and their policies from Settings, inside a transaction. */
export interface TimeOffSettingsRepository {
  updateType(
    timeOffTypeId: string,
    fields: Partial<{
      name: string;
      icon: TimeOffTypeIcon;
      colour: TimeOffTypeColour;
      private: boolean;
    }>,
  ): Promise<void>;
  /** Sets a policy's values; `key: null` makes it the company's own. */
  updatePolicy(policyId: string, values: Partial<PolicyValues> & { key?: null }): Promise<void>;
  /** A new policy of the type; returns its id. */
  insertPolicy(
    timeOffTypeId: string,
    values: PolicyValues & { key?: TimeOffPolicy["key"] },
  ): Promise<string>;
  /** Gives the policy copies of these rules, as new rows. */
  insertRules(policyId: string, rules: TimeOffPolicy["rules"]): Promise<void>;
  /** Stops the policy's yearly allowance rule; lines that point at it keep it. */
  removeYearlyEntitlement(policyId: string): Promise<void>;
  insertYearlyEntitlement(policyId: string, entitlement: YearlyEntitlement): Promise<void>;
  /** Deletes a policy nobody has used, with its rules. */
  deletePolicy(policyId: string): Promise<void>;
  /** Deletes a type nobody has used, with its policies and their rules. */
  deleteType(timeOffTypeId: string): Promise<void>;
  /** The allowances that got policy-changed lines in this transaction. */
  countAllowancesChangedInTransaction(): Promise<number>;
}

export function timeOffSettingsRepository(tx: Tx): TimeOffSettingsRepository {
  const orm = () => ormOf(tx);
  return {
    async updateType(timeOffTypeId, fields) {
      if (Object.keys(fields).length > 0) {
        await orm().update(timeOffTypes).set(fields).where(eq(timeOffTypes.id, timeOffTypeId));
      }
    },

    async updatePolicy(policyId, values) {
      await orm()
        .update(timeOffPolicies)
        .set(toColumns(values))
        .where(eq(timeOffPolicies.id, policyId));
    },

    async insertPolicy(timeOffTypeId, values) {
      const [row] = await orm()
        .insert(timeOffPolicies)
        .values({
          timeOffTypeId,
          key: values.key ?? null,
          ...toColumns(values),
          name: values.name,
          balance: values.balance,
        })
        .returning({ id: timeOffPolicies.id });
      return row!.id;
    },

    async insertRules(policyId, rules) {
      if (rules.length === 0) {
        return;
      }
      await orm()
        .insert(timeOffAllowanceRules)
        .values(
          rules.map((rule) =>
            rule.kind === "yearly_entitlement"
              ? yearlyRow(policyId, rule)
              : {
                  timeOffPolicyId: policyId,
                  kind: rule.kind,
                  afterYears: rule.afterYears,
                  extraDays: String(rule.extraDays),
                },
          ),
        );
    },

    async removeYearlyEntitlement(policyId) {
      await orm()
        .update(timeOffAllowanceRules)
        .set({ removedAt: sql`now()` })
        .where(
          and(
            eq(timeOffAllowanceRules.timeOffPolicyId, policyId),
            eq(timeOffAllowanceRules.kind, "yearly_entitlement"),
            isNull(timeOffAllowanceRules.removedAt),
          ),
        );
    },

    async insertYearlyEntitlement(policyId, entitlement) {
      await orm().insert(timeOffAllowanceRules).values(yearlyRow(policyId, entitlement));
    },

    async deletePolicy(policyId) {
      await orm()
        .delete(timeOffAllowanceRules)
        .where(eq(timeOffAllowanceRules.timeOffPolicyId, policyId));
      await orm().delete(timeOffPolicies).where(eq(timeOffPolicies.id, policyId));
    },

    async deleteType(timeOffTypeId) {
      const policies = await orm()
        .select({ id: timeOffPolicies.id })
        .from(timeOffPolicies)
        .where(eq(timeOffPolicies.timeOffTypeId, timeOffTypeId));
      for (const { id } of policies) {
        await this.deletePolicy(id);
      }
      await orm().delete(timeOffTypes).where(eq(timeOffTypes.id, timeOffTypeId));
    },

    async countAllowancesChangedInTransaction() {
      // Rows written in this transaction share its start time, which `now()` returns.
      const [row] = await orm()
        .select({ count: sql<number>`count(distinct ${allowances.id})::int` })
        .from(allowanceLedgerLines)
        .innerJoin(allowances, eq(allowances.id, allowanceLedgerLines.allowanceId))
        .where(
          and(
            eq(allowanceLedgerLines.causeKind, "policy_changed"),
            eq(allowanceLedgerLines.createdAt, sql`now()`),
          ),
        );
      return row!.count;
    },
  };
}

function toColumns(values: Partial<PolicyValues> & { key?: TimeOffPolicy["key"] }) {
  const { leaveYear, ...rest } = values;
  if (leaveYear === undefined) {
    return rest;
  }
  return {
    ...rest,
    leaveYearStart: leaveYear?.kind ?? null,
    leaveYearStartMonth: leaveYear?.kind === "leave_year_from_fixed_date" ? leaveYear.month : null,
    leaveYearStartDay: leaveYear?.kind === "leave_year_from_fixed_date" ? leaveYear.day : null,
  };
}

function yearlyRow(policyId: string, entitlement: YearlyEntitlement) {
  return {
    timeOffPolicyId: policyId,
    kind: "yearly_entitlement" as const,
    entitlementDays: String(entitlement.entitlementDays),
    entitlementDaysPerWeek: entitlement.entitlementDaysPerWeek,
    maxDays: entitlement.maxDays === null ? null : String(entitlement.maxDays),
  };
}
