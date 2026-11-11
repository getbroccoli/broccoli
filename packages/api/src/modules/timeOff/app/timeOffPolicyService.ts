import { ApplicationError } from "../../../core/applicationError";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, parseUuid, todayInLondon } from "../../../utils";
import {
  cancelPlannedVersion,
  createEmployeeReadService,
  createWorkingPatternService,
  type TermsOverview,
} from "../../employees";
import { type PolicyAssignment, timeOffPolicyRepository } from "../db";
import {
  changesCountsMidYear,
  parseRules,
  type PolicyVersion,
  type TimeOffPolicy,
  type TimeOffRulesInput,
  versionFromRules,
} from "../domain";
import {
  appendRulesHistory,
  employeesOf,
  ownerIds,
  rulesChanged,
  saveTermsDraft,
  versionOf,
} from "./policyRules";
import { cancelPolicyStop, saveTimeOffStop } from "./policyStop";
import {
  publishTerms,
  type PublishSuggestions,
  type PublishTermsInput,
  readPublishSuggestions,
} from "./termsPublish";
import type { TimeOffService } from "./timeOffService";

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
   * Saves these terms' unpublished draft for the type as a stop of their rules for it today, which
   * Publish ends from its date; replaces a rules draft. Nobody's rules change.
   */
  saveTimeOffStop: (
    ctx: SecurityContext,
    input: { termsId: string; timeOffTypeId: string },
  ) => Promise<PolicyVersion>;
  /**
   * Removes a rules assignment that starts after today; the one ending the day before runs to its
   * end. CONFLICT once it has started, or when the two around it would count the type differently
   * partway through a leave year. Keeps its people's allowances and adds a line to the terms' history.
   */
  cancelPolicyChange: (ctx: SecurityContext, input: { assignmentId: string }) => Promise<void>;
  /**
   * Makes the assignment a planned stop ends open-ended again: the last one for its type, ending on
   * or after today. CONFLICT when it is no planned stop.
   */
  cancelPolicyStop: (ctx: SecurityContext, input: { assignmentId: string }) => Promise<void>;
  /** What Publish on the terms would do from `from`: their unpublished versions and every owner it reaches. */
  readPublishSuggestions: (
    ctx: SecurityContext,
    input: { termsId: string; from: string },
  ) => Promise<PublishSuggestions>;
  /**
   * Publishes every unpublished version of the terms, the working week and each type's rules, and
   * gives each to the `owners` using what it replaces from `startDate`, in one transaction that
   * keeps their allowances. CONFLICT when the versions are not the ones `versions` names at their
   * revisions; an owner not suggested is invalid input. Returns the terms as they are afterwards.
   */
  publishTerms: (ctx: SecurityContext, input: PublishTermsInput) => Promise<TermsOverview>;
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
  const publishing = {
    transact,
    logger,
    today,
    timeOff,
    employeeReads,
    workingPatterns: createWorkingPatternService({ transact, logger, today }),
  };
  return {
    async saveTimeOffPolicy(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const rules = parseRules(input.rules);
      const saved = await transact((tx) =>
        saveTermsDraft(
          employeeReads,
          tx,
          { ...input, today: today() },
          ({ policies, draft, inForce }) => ({
            version: versionFromRules(
              rules,
              draft ?? (inForce && versionOf(policies, inForce.versionId)),
            ),
            stops: false,
          }),
        ),
      );
      logger.info(
        { termsId: input.termsId, timeOffPolicyVersionId: saved.id, revision: saved.revision },
        "Saved unpublished time off rules",
      );
      return saved;
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

    saveTimeOffStop: (ctx, input) => saveTimeOffStop(publishing, ctx, input),

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
        refuseCountsChangeOnCancel(policies, extended, lane, removed);
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
          employeeIds: await employeesOf(employeeReads, tx, removed.owner),
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

    cancelPolicyStop: (ctx, input) => cancelPolicyStop(publishing, ctx, input),
    readPublishSuggestions: (ctx, input) => readPublishSuggestions(publishing, ctx, input),
    publishTerms: (ctx, input) => publishTerms(publishing, ctx, input),
  };
}

/**
 * Refuses, with CONFLICT, cancelling `removed` when the rules it leaves running into the next row
 * would count the type differently partway through a leave year.
 */
function refuseCountsChangeOnCancel(
  policies: readonly TimeOffPolicy[],
  extended: PolicyAssignment | null,
  lane: readonly PolicyAssignment[],
  removed: PolicyAssignment,
) {
  // Only a row starting the day after the cancelled one ends follows on from the extended row.
  const next = lane.find(
    ({ startDate }) => removed.endDate !== null && startDate === addDays(removed.endDate, 1),
  );
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
}
