import { asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import { isUniqueViolation, type Orm, ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import type { Assignment, VersionStatus } from "../../employees";
import {
  type NewPolicyVersion,
  type TimeOffPolicy,
  type TimeOffType,
  STANDARD_TIME_OFF_TYPES,
  type TimeOffTypeIdentity,
  type TimeOffTypeKey,
  TimeOffTypeBookedError,
  TimeOffTypeNameTakenError,
} from "../domain";
import { allowances } from "./allowancesTable";
import { timeOffAllowanceRules } from "./timeOffAllowanceRulesTable";
import { timeOffPolicies } from "./timeOffPoliciesTable";
import { timeOffPolicyAssignments } from "./timeOffPolicyAssignmentsTable";
import { timeOffPolicyVersions } from "./timeOffPolicyVersionsTable";
import { timeOff } from "./timeOffTable";
import { timeOffTypeColumns, toTimeOffType } from "./timeOffTypeColumns";
import {
  insertRules,
  ownerColumns,
  toAssignment,
  toVersion,
  versionColumns,
} from "./timeOffPolicyRows";
import { TIME_OFF_TYPE_NAME_UNIQUE, timeOffTypes } from "./timeOffTypesTable";

/** A policy version given to an employee or terms for one type from a date to a date. */
export interface PolicyAssignment extends Assignment {
  timeOffTypeId: string;
  timeOffPolicyId: string;
}

/** Time off types and policies, and who has which version when, through the pool or a transaction. */
export interface TimeOffPolicyRepository {
  /** Every time off type, with or without a policy. */
  findAllTypes(): Promise<TimeOffType[]>;
  /** Adds a company type; throws `TimeOffTypeNameTakenError` when another type has the name. */
  insertType(identity: TimeOffTypeIdentity): Promise<TimeOffType>;
  /** The changed type, or null when no type has the id; throws `TimeOffTypeNameTakenError` like `insertType`. */
  updateType(id: string, changes: Partial<TimeOffTypeIdentity>): Promise<TimeOffType | null>;
  /**
   * Deletes a type with its policies, assignments and allowances: false when no type has the id.
   * Throws `TimeOffTypeBookedError` when any time off of the type is on record.
   */
  deleteType(id: string): Promise<boolean>;
  /** Every policy with its type and versions, oldest first, drafts among them, each with its rules. */
  findAll(): Promise<TimeOffPolicy[]>;
  /** Serializes changes to policies until the transaction ends. */
  lockPolicies(): Promise<void>;
  /** Keeps policies from changing until the transaction ends, while others may read them too. */
  sharePolicies(): Promise<void>;
  /** Whether any terms have a time off policy assigned: whether time off is on. */
  hasAnyTermsPolicies(): Promise<boolean>;
  /** A new policy without versions; returns its id. */
  insertPolicy(policy: { timeOffTypeId: string; name?: string | null }): Promise<string>;
  /** Deletes a policy with its versions; none may be assigned. */
  deletePolicy(id: string): Promise<void>;
  /** A new version with its rules, revision 1; returns its id. */
  insertVersion(
    timeOffPolicyId: string,
    version: NewPolicyVersion & { status: VersionStatus; termsId?: string | null },
  ): Promise<string>;
  /** New rules on a draft, one revision later. */
  updateDraft(versionId: string, version: NewPolicyVersion): Promise<void>;
  /** Makes a draft published, no longer any terms' draft. */
  publishVersion(versionId: string): Promise<void>;
  /** Deletes a draft with its rules; nothing may be granted from them. */
  deleteVersion(versionId: string): Promise<void>;
  /**
   * Deletes every assignment and policy with its versions and rules, also removed versions'
   * rules, and the company's own types, and gives the seeded types back, deleted or changed;
   * nothing else may point at a policy or own type.
   */
  deleteAll(): Promise<void>;
  /** The assignments of these employees and terms, oldest first. */
  findAssignments(owners: {
    employeeIds?: readonly string[];
    termsIds?: readonly string[];
  }): Promise<PolicyAssignment[]>;
  /** The assignments of any of these versions, oldest first. */
  findAssignmentsOfVersions(versionIds: readonly string[]): Promise<PolicyAssignment[]>;
  /** The assignments with these ids. */
  findAssignmentsById(ids: readonly string[]): Promise<PolicyAssignment[]>;
  /** Every assignment, oldest first. */
  findAllAssignments(): Promise<PolicyAssignment[]>;
  insertAssignment(row: Omit<PolicyAssignment, "id">): Promise<string>;
  /** Sets an assignment's last day; null makes it open-ended. */
  endAssignment(id: string, endDate: CalendarDate | null): Promise<void>;
  deleteAssignment(id: string): Promise<void>;
}

export function timeOffPolicyRepository(db: Orm | Tx): TimeOffPolicyRepository {
  const orm = () => ormOf(db);
  return {
    async findAllTypes() {
      return (await orm().select().from(timeOffTypes)).map(toTimeOffType);
    },

    async insertType(identity) {
      try {
        // A company type asks for approval, as Annual leave does, until approvals are configurable.
        const [type] = await orm()
          .insert(timeOffTypes)
          .values({ ...timeOffTypeColumns(identity), needsApproval: true })
          .returning();
        return toTimeOffType(type!);
      } catch (error) {
        throw nameTakenOr(error);
      }
    },

    async updateType(id, changes) {
      try {
        const [type] = await orm()
          .update(timeOffTypes)
          .set(timeOffTypeColumns(changes))
          .where(eq(timeOffTypes.id, id))
          .returning();
        return type ? toTimeOffType(type) : null;
      } catch (error) {
        throw nameTakenOr(error);
      }
    },

    async deleteType(id) {
      const [booked] = await orm()
        .select({ id: timeOff.id })
        .from(timeOff)
        .where(eq(timeOff.timeOffTypeId, id))
        .limit(1);
      if (booked) {
        throw new TimeOffTypeBookedError();
      }
      await orm().delete(allowances).where(eq(allowances.timeOffTypeId, id));
      await orm()
        .delete(timeOffPolicyAssignments)
        .where(eq(timeOffPolicyAssignments.timeOffTypeId, id));
      await orm().delete(timeOffPolicies).where(eq(timeOffPolicies.timeOffTypeId, id));
      const deleted = await orm()
        .delete(timeOffTypes)
        .where(eq(timeOffTypes.id, id))
        .returning({ id: timeOffTypes.id });
      return deleted.length > 0;
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
        .orderBy(asc(timeOffPolicyVersions.id));
      const rules = await orm().select().from(timeOffAllowanceRules);
      return policies.map(({ policy, type }) => ({
        id: policy.id,
        timeOffType: toTimeOffType(type),
        name: policy.name,
        versions: versions
          .filter((version) => version.timeOffPolicyId === policy.id)
          .map((version) => toVersion(version, rules)),
      }));
    },

    async lockPolicies() {
      await orm().execute(sql`lock table ${timeOffPolicies} in share row exclusive mode`);
    },

    async sharePolicies() {
      await orm().execute(sql`lock table ${timeOffPolicies} in share mode`);
    },

    async hasAnyTermsPolicies() {
      const [assignment] = await orm()
        .select({ id: timeOffPolicyAssignments.id })
        .from(timeOffPolicyAssignments)
        .where(isNotNull(timeOffPolicyAssignments.termsId))
        .limit(1);
      return assignment !== undefined;
    },

    async insertPolicy({ timeOffTypeId, name = null }) {
      const [inserted] = await orm()
        .insert(timeOffPolicies)
        .values({ timeOffTypeId, name })
        .returning({ id: timeOffPolicies.id });
      return inserted!.id;
    },

    async deletePolicy(id) {
      await orm().delete(timeOffPolicies).where(eq(timeOffPolicies.id, id));
    },

    async insertVersion(timeOffPolicyId, { status, termsId = null, ...version }) {
      const [inserted] = await orm()
        .insert(timeOffPolicyVersions)
        .values({ timeOffPolicyId, status, termsId, ...versionColumns(version) })
        .returning({ id: timeOffPolicyVersions.id });
      await insertRules(db, inserted!.id, version.rules);
      return inserted!.id;
    },

    async updateDraft(versionId, version) {
      await orm()
        .update(timeOffPolicyVersions)
        .set({
          ...versionColumns(version),
          revision: sql`${timeOffPolicyVersions.revision} + 1`,
        })
        .where(eq(timeOffPolicyVersions.id, versionId));
      await orm()
        .delete(timeOffAllowanceRules)
        .where(eq(timeOffAllowanceRules.timeOffPolicyVersionId, versionId));
      await insertRules(db, versionId, version.rules);
    },

    async publishVersion(versionId) {
      await orm()
        .update(timeOffPolicyVersions)
        .set({ status: "published", termsId: null })
        .where(eq(timeOffPolicyVersions.id, versionId));
    },

    async deleteVersion(versionId) {
      await orm()
        .delete(timeOffAllowanceRules)
        .where(eq(timeOffAllowanceRules.timeOffPolicyVersionId, versionId));
      await orm().delete(timeOffPolicyVersions).where(eq(timeOffPolicyVersions.id, versionId));
    },

    async deleteAll() {
      await orm().delete(timeOffPolicyAssignments);
      await orm().delete(timeOffPolicies);
      await orm()
        .delete(timeOffAllowanceRules)
        .where(isNull(timeOffAllowanceRules.timeOffPolicyVersionId));
      await orm().delete(timeOffTypes).where(isNull(timeOffTypes.typeKey));
      // Seeded types may hold each other's names; free them all before restoring any.
      await orm()
        .update(timeOffTypes)
        .set({ name: sql`${timeOffTypes.id}::text` })
        .where(isNotNull(timeOffTypes.typeKey));
      for (const [typeKey, standard] of Object.entries(STANDARD_TIME_OFF_TYPES)) {
        const columns = { ...timeOffTypeColumns(standard), needsApproval: standard.needsApproval };
        await orm()
          .insert(timeOffTypes)
          .values({ ...columns, typeKey: typeKey as TimeOffTypeKey })
          .onConflictDoUpdate({ target: timeOffTypes.typeKey, set: columns });
      }
    },

    async findAssignments({ employeeIds = [], termsIds = [] }) {
      if (employeeIds.length === 0 && termsIds.length === 0) {
        return [];
      }
      const rows = await orm()
        .select()
        .from(timeOffPolicyAssignments)
        .where(
          or(
            employeeIds.length > 0
              ? inArray(timeOffPolicyAssignments.employeeId, [...employeeIds])
              : undefined,
            termsIds.length > 0
              ? inArray(timeOffPolicyAssignments.termsId, [...termsIds])
              : undefined,
          ),
        )
        .orderBy(asc(timeOffPolicyAssignments.startDate));
      return rows.map(toAssignment);
    },

    async findAssignmentsOfVersions(versionIds) {
      if (versionIds.length === 0) {
        return [];
      }
      const rows = await orm()
        .select()
        .from(timeOffPolicyAssignments)
        .where(inArray(timeOffPolicyAssignments.timeOffPolicyVersionId, [...versionIds]))
        .orderBy(asc(timeOffPolicyAssignments.startDate));
      return rows.map(toAssignment);
    },

    async findAssignmentsById(ids) {
      const rows = await orm()
        .select()
        .from(timeOffPolicyAssignments)
        .where(inArray(timeOffPolicyAssignments.id, [...ids]));
      return rows.map(toAssignment);
    },

    async findAllAssignments() {
      const rows = await orm()
        .select()
        .from(timeOffPolicyAssignments)
        .orderBy(asc(timeOffPolicyAssignments.startDate));
      return rows.map(toAssignment);
    },

    async insertAssignment({ versionId, owner, ...row }) {
      const [inserted] = await orm()
        .insert(timeOffPolicyAssignments)
        .values({ ...row, timeOffPolicyVersionId: versionId, ...ownerColumns(owner) })
        .returning({ id: timeOffPolicyAssignments.id });
      return inserted!.id;
    },

    async endAssignment(id, endDate) {
      await orm()
        .update(timeOffPolicyAssignments)
        .set({ endDate })
        .where(eq(timeOffPolicyAssignments.id, id));
    },

    async deleteAssignment(id) {
      await orm().delete(timeOffPolicyAssignments).where(eq(timeOffPolicyAssignments.id, id));
    },
  };
}

function nameTakenOr(error: unknown): unknown {
  return isUniqueViolation(error, TIME_OFF_TYPE_NAME_UNIQUE)
    ? new TimeOffTypeNameTakenError()
    : error;
}
