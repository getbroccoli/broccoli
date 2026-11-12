import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { AssignmentOwner } from "../../employees";
import type { AllowanceRule, NewPolicyVersion, PolicyVersion } from "../domain";
import { timeOffAllowanceRules } from "./timeOffAllowanceRulesTable";
import type { PolicyAssignment } from "./timeOffPolicyRepository";
import { timeOffPolicyAssignments } from "./timeOffPolicyAssignmentsTable";
import { timeOffPolicyVersions } from "./timeOffPolicyVersionsTable";

/** How policy versions, their rules and assignments map to and from their rows. */

export async function insertRules(
  db: Orm | Tx,
  versionId: string,
  rules: NewPolicyVersion["rules"],
) {
  if (rules.length > 0) {
    await ormOf(db)
      .insert(timeOffAllowanceRules)
      .values(rules.map((rule) => ruleRow(versionId, rule)));
  }
}

export function versionColumns({ balance, bankHolidays, leaveYear }: NewPolicyVersion) {
  return {
    balance,
    bankHolidays,
    leaveYearStart: leaveYear?.kind ?? null,
    leaveYearStartMonth: leaveYear?.kind === "leave_year_from_fixed_date" ? leaveYear.month : null,
    leaveYearStartDay: leaveYear?.kind === "leave_year_from_fixed_date" ? leaveYear.day : null,
  };
}

export function toAssignment(row: typeof timeOffPolicyAssignments.$inferSelect): PolicyAssignment {
  return {
    id: row.id,
    versionId: row.timeOffPolicyVersionId,
    timeOffTypeId: row.timeOffTypeId,
    timeOffPolicyId: row.timeOffPolicyId,
    owner: row.employeeId !== null ? { employeeId: row.employeeId } : { termsId: row.termsId! },
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

export function ownerColumns(owner: AssignmentOwner) {
  // Both read as given, so the database refuses an owner that names both or neither.
  return {
    employeeId: "employeeId" in owner ? owner.employeeId : null,
    termsId: "termsId" in owner ? owner.termsId : null,
  };
}

export function toVersion(
  row: typeof timeOffPolicyVersions.$inferSelect,
  rules: readonly (typeof timeOffAllowanceRules.$inferSelect)[],
): PolicyVersion {
  return {
    id: row.id,
    timeOffPolicyId: row.timeOffPolicyId,
    status: row.status,
    termsId: row.termsId,
    revision: row.revision,
    stops: row.stops,
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
