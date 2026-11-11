import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import { createRecordHistoryService } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, coversDate, parseUuid, todayInLondon } from "../../../utils";
import {
  type AssignmentOwner,
  cancelPlannedVersion,
  createEmployeeReadService,
  createWorkingPatternService,
  type Employee,
  isSameOwner,
  parseChangeDate,
  parseDateField,
} from "../../employees";
import { type PolicyAssignment, timeOffPolicyRepository } from "../db";
import {
  changesCountsMidYear,
  type NewPolicyVersion,
  parseRules,
  type PolicyVersion,
  rulesValue,
  type TimeOffPolicy,
  type TimeOffRulesInput,
  type TimeOffType,
  versionFromRules,
} from "../domain";
import { type PolicyPublish, planPolicies, readPolicyReach } from "./termsPublish";
import type { TimeOffService } from "./timeOffService";

const recordHistory = createRecordHistoryService();

/**
 * The time off rules admins keep on terms: unpublished rules saved and discarded, a planned change
 * cancelled, and Publish, which applies all of a set of terms' unpublished working week and rules
 * from one date. Admins only.
 */
export interface TimeOffPolicyService {
  /**
   * Creates these terms' unpublished rules for the type, under the policy they have for it today
   * or a new one for an offer, or saves them again one revision later. Nobody's rules change.
   */
  saveTimeOffPolicy: (
    ctx: SecurityContext,
    input: { termsId: string; timeOffTypeId: string; rules: TimeOffRulesInput },
  ) => Promise<PolicyVersion>;
  /** Deletes unpublished rules; a policy left without versions goes too. */
  discardTimeOffPolicy: (ctx: SecurityContext, input: { versionId: string }) => Promise<void>;
  /**
   * Removes a rules assignment that starts after today; the one ending the day before runs to its
   * end. CONFLICT once it has started, or when the two around it would count the type differently
   * partway through a leave year. Keeps its people's allowances and adds a line to the terms' history.
   */
  cancelPolicyChange: (ctx: SecurityContext, input: { assignmentId: string }) => Promise<void>;
  /** What Publish on the terms would do from `from`: their unpublished versions and every owner it reaches. */
  readPublishSuggestions: (
    ctx: SecurityContext,
    input: { termsId: string; from: string },
  ) => Promise<PublishSuggestions>;
  /**
   * Publishes every unpublished version of the terms, the working week and each type's rules, and
   * gives each to the `owners` using what it replaces from `startDate`, in one transaction that
   * keeps their allowances. CONFLICT when the versions are not the ones `versions` names at their
   * revisions; an owner not suggested is invalid input.
   */
  publishTerms: (
    ctx: SecurityContext,
    input: {
      termsId: string;
      versions: readonly { id: string; revision: number }[];
      startDate: string;
      owners: readonly { employeeId?: string | null; termsId?: string | null }[];
    },
  ) => Promise<void>;
}

/** What Publish on a set of terms would do from a date. */
export interface PublishSuggestions {
  /** The terms' unpublished versions, as Publish takes them; a null type is the working week. */
  versions: { id: string; revision: number; timeOffTypeId: string | null }[];
  /**
   * These terms first, then every other owner it reaches, each named, with the versions it gets
   * and whom they reach.
   */
  owners: { owner: AssignmentOwner; name: string; versionIds: string[]; reached: Employee[] }[];
}

type Dependencies = Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  today?: () => CalendarDate;
};

export function createTimeOffPolicyService({
  orm,
  transact,
  logger,
  timeOff,
  today = todayInLondon,
}: Dependencies): TimeOffPolicyService {
  const employeeReads = createEmployeeReadService({ orm });
  const workingPatterns = createWorkingPatternService({ transact, logger, today });
  return {
    async saveTimeOffPolicy(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const rules = parseRules(input.rules);
      const saved = await transact(async (tx) => {
        const repository = timeOffPolicyRepository(tx);
        await repository.lockPolicies();
        const termsId = await existingTerms(tx, input.termsId);
        const timeOffType = existingType(await repository.findAllTypes(), input.timeOffTypeId);
        const policies = await repository.findAll();
        const draft = draftOf(policies, termsId, timeOffType.id);
        const inForce = await termsRowOn(tx, termsId, timeOffType.id, today());
        const base = draft ?? (inForce && versionOf(policies, inForce.versionId));
        const version = versionFromRules(rules, base);
        if (draft) {
          await repository.updateDraft(draft.id, version);
          return draft.id;
        }
        const policyId =
          inForce?.timeOffPolicyId ??
          (await repository.insertPolicy({ timeOffTypeId: timeOffType.id }));
        return repository.insertVersion(policyId, { ...version, status: "draft", termsId });
      });
      logger.info(
        { termsId: input.termsId, timeOffPolicyVersionId: saved },
        "Saved unpublished time off rules",
      );
      return versionOf(await timeOffPolicyRepository(orm).findAll(), saved);
    },

    async discardTimeOffPolicy(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const versionId = parseUuid(input.versionId);
      const discarded = await transact(async (tx) => {
        const repository = timeOffPolicyRepository(tx);
        await repository.lockPolicies();
        const policy = (await repository.findAll()).find(({ versions }) =>
          versions.some(({ id, status }) => id === versionId && status === "draft"),
        );
        if (!policy) {
          throw new ApplicationError("NOT_FOUND", "No unpublished time off rules have this id.");
        }
        await repository.deleteVersion(versionId!);
        if (policy.versions.length === 1) {
          await repository.deletePolicy(policy.id);
        }
        return policy;
      });
      logger.info(
        { timeOffPolicyId: discarded.id, timeOffPolicyVersionId: versionId },
        "Discarded time off rules",
      );
    },

    async cancelPolicyChange(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const assignmentId = parseUuid(input.assignmentId);
      const { removed, ensured } = await transact(async (tx) => {
        const repository = timeOffPolicyRepository(tx);
        await repository.lockPolicies();
        const [removed] = assignmentId ? await repository.findAssignmentsById([assignmentId]) : [];
        if (!removed) {
          throw new ApplicationError("NOT_FOUND", "No time off rules change has this id.");
        }
        const policies = await repository.findAll();
        const lane = (await repository.findAssignments(ownerIds(removed.owner))).filter(
          (row) => row.timeOffTypeId === removed.timeOffTypeId,
        );
        const { extended } = cancelPlannedVersion(lane, removed.startDate, today());
        const next = lane.find(({ startDate }) => startDate > removed.startDate);
        if (
          extended &&
          next &&
          changesCountsMidYear(versionOf(policies, extended.versionId), {
            ...versionOf(policies, next.versionId),
            startDate: next.startDate,
          })
        ) {
          throw new ApplicationError(
            "CONFLICT",
            "Cancelling this change would change how the type counts partway through a leave year.",
          );
        }
        await repository.deleteAssignment(removed.id);
        if (extended) {
          await repository.endAssignment(extended.id, removed.endDate);
        }
        const policy = policies.find(({ id }) => id === removed.timeOffPolicyId)!;
        await appendRulesHistory(ctx, tx, removed.owner, policy.timeOffType, {
          before: { ...versionOf(policies, removed.versionId), startDate: removed.startDate },
          after: null,
        });
        const ensured = await timeOff.ensureAllowances(ctx, tx, {
          employeeIds: await employeesOf(tx, removed.owner),
          cause: rulesChanged(removed.timeOffPolicyId, removed.startDate),
        });
        return { removed, ensured };
      });
      logger.info(
        {
          assignmentId: removed.id,
          ...removed.owner,
          timeOffTypeId: removed.timeOffTypeId,
          timeOffPolicyId: removed.timeOffPolicyId,
          startDate: removed.startDate,
          ...ensured,
        },
        "Cancelled a time off rules change",
      );
    },

    async readPublishSuggestions(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const from = parseDateField("from", input.from);
      return transact(async (tx) => {
        await timeOffPolicyRepository(tx).sharePolicies();
        const termsId = await existingTerms(tx, input.termsId);
        const week = await workingPatterns.readPublish(tx, { termsId, from });
        const policies = await planPolicies(tx, termsId, from);
        const owners = [
          {
            owner: { termsId } as AssignmentOwner,
            versionIds: [] as string[],
            reachedIds: new Set<string>(),
          },
        ];
        const add = (owner: AssignmentOwner, versionId: string, reachedIds: readonly string[]) => {
          const known = owners.find((entry) => isSameOwner(entry.owner, owner));
          const entry = known ?? { owner, versionIds: [], reachedIds: new Set<string>() };
          entry.versionIds.push(versionId);
          for (const id of reachedIds) entry.reachedIds.add(id);
          if (!known) owners.push(entry);
        };
        for (const { owner, reachedIds } of week?.owners ?? []) {
          add(owner, week!.version.id, reachedIds);
        }
        for (const publish of policies) {
          for (const ownerPlan of publish.owners) {
            const reached = await readPolicyReach(employeeReads, tx, publish, ownerPlan, from);
            add(ownerPlan.owner, publish.version.id, reached);
          }
        }
        return {
          versions: [
            ...(week ? [{ ...week.version, timeOffTypeId: null }] : []),
            ...policies.map(({ version, policy }) => ({
              ...version,
              timeOffTypeId: policy.timeOffType.id,
            })),
          ].map(({ id, revision, timeOffTypeId }) => ({ id, revision, timeOffTypeId })),
          owners: await nameOwners(tx, owners),
        };
      });
    },

    async publishTerms(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const from = parseChangeDate(input.startDate, today());
      const owners = parseOwners(input.owners);
      const result = await transact(async (tx) => {
        const repository = timeOffPolicyRepository(tx);
        await repository.lockPolicies();
        const termsId = await existingTerms(tx, input.termsId);
        const week = await workingPatterns.readPublish(tx, { termsId, from });
        const policies = await planPolicies(tx, termsId, from);
        refuseChangedVersions(input.versions, [
          ...(week ? [week.version] : []),
          ...policies.map(({ version }) => version),
        ]);
        const suggested = [
          { termsId },
          ...(week?.owners.map(({ owner }) => owner) ?? []),
          ...policies.flatMap((publish) => publish.owners.map(({ owner }) => owner)),
        ];
        if (owners.some((owner) => !suggested.some((known) => isSameOwner(known, owner)))) {
          throw invalidInput([{ field: "owners", code: "not_using_policy" }]);
        }
        const weekPeople = week
          ? (await workingPatterns.publish(ctx, tx, { termsId, from, owners })).employeeIds
          : [];
        const ensured = [
          await timeOff.ensureAllowances(ctx, tx, {
            employeeIds: weekPeople,
            cause: { kind: "WORKING_PATTERN_CHANGED", ref: from },
          }),
        ];
        for (const publish of policies) {
          const people = await publishPolicy(ctx, tx, publish, owners, from);
          ensured.push(
            await timeOff.ensureAllowances(ctx, tx, {
              employeeIds: people,
              cause: rulesChanged(publish.policy.id, from),
            }),
          );
        }
        return {
          termsId,
          versionCount: policies.length + (week ? 1 : 0),
          allowancesCreated: ensured.reduce((sum, run) => sum + run.allowancesCreated, 0),
          linesAppended: ensured.reduce((sum, run) => sum + run.linesAppended, 0),
        };
      });
      logger.info(
        { ...result, startDate: from, ownerCount: owners.length },
        "Published terms' working week and time off rules",
      );
    },
  };

  /** The owners with their names and the people they reach, by name. */
  async function nameOwners(
    tx: Tx,
    owners: readonly { owner: AssignmentOwner; versionIds: string[]; reachedIds: Set<string> }[],
  ): Promise<PublishSuggestions["owners"]> {
    const termsNames = await employeeReads.readTermsNames(
      tx,
      owners.flatMap(({ owner }) => ("termsId" in owner ? [owner.termsId] : [])),
    );
    const people = await employeeReads.readEmployeesByName(
      tx,
      owners.flatMap(({ owner }) => ("employeeId" in owner ? [owner.employeeId] : [])),
    );
    const named = [];
    for (const { owner, versionIds, reachedIds } of owners) {
      const person = "employeeId" in owner && people.find(({ id }) => id === owner.employeeId);
      named.push({
        owner,
        name: "termsId" in owner ? termsNames.get(owner.termsId)! : fullName(person || null),
        versionIds,
        reached: await employeeReads.readEmployeesByName(tx, [...reachedIds]),
      });
    }
    return named;
  }

  async function existingTerms(tx: Tx, id: string): Promise<string> {
    const termsId = parseUuid(id);
    if (!termsId || (await employeeReads.readTermsMemberIds(tx, termsId)) === null) {
      throw invalidInput([{ field: "termsId", code: "not_found" }]);
    }
    return termsId;
  }

  async function employeesOf(tx: Tx, owner: AssignmentOwner): Promise<string[]> {
    return "employeeId" in owner
      ? [owner.employeeId]
      : ((await employeeReads.readTermsMemberIds(tx, owner.termsId)) ?? []);
  }

  /**
   * Publishes one policy version and gives it to each ticked owner its plan reaches, with a line
   * in the terms' history; returns the employees whose rules may have changed.
   */
  async function publishPolicy(
    ctx: SecurityContext,
    tx: Tx,
    { version, policy, owners: plans }: PolicyPublish,
    owners: readonly AssignmentOwner[],
    from: CalendarDate,
  ): Promise<string[]> {
    const repository = timeOffPolicyRepository(tx);
    const policies = await repository.findAll();
    const people = new Set<string>();
    for (const { owner, plan, replaced } of plans) {
      if (!owners.some((ticked) => isSameOwner(ticked, owner))) {
        continue;
      }
      for (const id of plan.deletedIds) await repository.deleteAssignment(id);
      for (const { id, endDate } of plan.ended) await repository.endAssignment(id, endDate);
      for (const span of plan.added) {
        await repository.insertAssignment({
          ...span,
          owner,
          versionId: version.id,
          timeOffPolicyId: policy.id,
          timeOffTypeId: policy.timeOffType.id,
        });
      }
      await appendRulesHistory(ctx, tx, owner, policy.timeOffType, {
        before: replaced && {
          ...versionOf(policies, replaced.versionId),
          startDate: replaced.startDate,
        },
        after: { ...version, startDate: from },
      });
      for (const id of await employeesOf(tx, owner)) people.add(id);
    }
    await repository.publishVersion(version.id);
    return [...people];
  }
}

/** The owners Publish is asked for: each names one employee or one set of terms. */
function parseOwners(
  owners: readonly { employeeId?: string | null; termsId?: string | null }[],
): AssignmentOwner[] {
  return owners.map(({ employeeId, termsId }) => {
    const employee = employeeId ? parseUuid(employeeId) : null;
    const terms = termsId ? parseUuid(termsId) : null;
    if ((employee === null) === (terms === null)) {
      throw invalidInput([{ field: "owners", code: "invalid" }]);
    }
    return employee ? { employeeId: employee } : { termsId: terms! };
  });
}

/** Refuses, with CONFLICT, unpublished versions that are not exactly the ones asked, at their revisions. */
function refuseChangedVersions(
  asked: readonly { id: string; revision: number }[],
  current: readonly { id: string; revision: number }[],
) {
  const same =
    asked.length === current.length &&
    current.every(({ id, revision }) =>
      asked.some((version) => version.id === id && version.revision === revision),
    );
  if (!same) {
    throw new ApplicationError("CONFLICT", "These changes were saved again since you opened them.");
  }
}

/**
 * On terms, the line in their history for a change to a type's rules: the rules before and after,
 * each with the date it applies from; null before for an offer, null after when cancelled.
 */
async function appendRulesHistory(
  ctx: SecurityContext,
  tx: Tx,
  owner: AssignmentOwner,
  timeOffType: TimeOffType,
  {
    before,
    after,
  }: {
    before: (NewPolicyVersion & { startDate: CalendarDate }) | null;
    after: (NewPolicyVersion & { startDate: CalendarDate }) | null;
  },
) {
  if (!("termsId" in owner)) {
    return;
  }
  await recordHistory.append(ctx, tx, {
    recordType: "terms",
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [
      {
        recordId: owner.termsId,
        changes: [
          {
            field: `timeOff.${timeOffType.id}`,
            oldValue: before && rulesValue(before),
            newValue: after && rulesValue(after),
            newLabel: timeOffType.name,
          },
        ],
      },
    ],
  });
}

function fullName(person: Employee | null): string {
  return person ? `${person.firstName} ${person.lastName}` : "";
}

function rulesChanged(timeOffPolicyId: string, from: CalendarDate) {
  return { kind: "TIME_OFF_RULES_CHANGED" as const, ref: `${timeOffPolicyId}:${from}`, from };
}

/** The terms' unpublished rules for the type, if any. */
function draftOf(
  policies: readonly TimeOffPolicy[],
  termsId: string,
  timeOffTypeId: string,
): PolicyVersion | null {
  return (
    policies
      .filter(({ timeOffType }) => timeOffType.id === timeOffTypeId)
      .flatMap(({ versions }) => versions)
      .find(({ status, termsId: owner }) => status === "draft" && owner === termsId) ?? null
  );
}

/** The terms' assignment for the type covering `date`, else their last one; null without any. */
async function termsRowOn(
  tx: Tx,
  termsId: string,
  timeOffTypeId: string,
  date: CalendarDate,
): Promise<PolicyAssignment | null> {
  const rows = (await timeOffPolicyRepository(tx).findAssignments({ termsIds: [termsId] })).filter(
    (row) => row.timeOffTypeId === timeOffTypeId,
  );
  return rows.find((row) => coversDate(row, date)) ?? rows.at(-1) ?? null;
}

function versionOf(policies: readonly TimeOffPolicy[], versionId: string): PolicyVersion {
  return policies.flatMap(({ versions }) => versions).find(({ id }) => id === versionId)!;
}

function ownerIds(owner: AssignmentOwner) {
  return "employeeId" in owner
    ? { employeeIds: [owner.employeeId] }
    : { termsIds: [owner.termsId] };
}

/** The type acted on; refuses one that does not exist as invalid input. */
function existingType(types: readonly TimeOffType[], timeOffTypeId: string): TimeOffType {
  const type = types.find(({ id }) => id === parseUuid(timeOffTypeId));
  if (!type) {
    throw invalidInput([{ field: "timeOffTypeId", code: "not_found" }]);
  }
  return type;
}
