import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, coversDate, parseUuid, todayInLondon } from "../../../utils";
import {
  cancelPlannedVersion,
  createEmployeeReadService,
  createWorkingPatternService,
  type TermsOverview,
} from "../../employees";
import { type PolicyAssignment, timeOffPolicyRepository } from "../db";
import {
  changesCountsMidYear,
  isPlannedStop,
  parseRules,
  type PolicyVersion,
  type TimeOffPolicy,
  type TimeOffRulesInput,
  versionFromRules,
} from "../domain";
import {
  appendRulesHistory,
  employeesOf,
  existingTerms,
  existingType,
  ownerIds,
  rulesChanged,
  versionOf,
} from "./policyRules";
import { cancelTermsStop, stopTermsPolicy } from "./policyStop";
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
   * Stops offering the type on the terms from `stopDate`, no earlier than the start of the current
   * leave year: their rules end the day before and later ones go. CONFLICT while someone's booked
   * time off of the type from then would be left without rules. Returns the row that ends.
   */
  stopPolicy: (
    ctx: SecurityContext,
    input: { termsId: string; timeOffTypeId: string; stopDate: string },
  ) => Promise<PolicyAssignment>;
  /**
   * Removes a rules assignment that starts after today; the one ending the day before runs to its
   * end. Given the row a planned stop ends, makes it open-ended again. CONFLICT once a change has
   * started, or when the two around it would count the type differently partway through a leave
   * year. Keeps its people's allowances and adds a line to the terms' history.
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
  const stopping = { employeeReads, timeOff, today };
  return {
    async saveTimeOffPolicy(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const rules = parseRules(input.rules);
      const saved = await transact(async (tx) => {
        const repository = timeOffPolicyRepository(tx);
        await repository.lockPolicies();
        const termsId = await existingTerms(employeeReads, tx, input.termsId);
        const timeOffType = existingType(await repository.findAllTypes(), input.timeOffTypeId);
        const policies = await repository.findAll();
        const draft = draftOf(policies, termsId, timeOffType.id);
        const inForce = await termsRowOn(tx, termsId, timeOffType.id, today());
        const base = draft ?? (inForce && versionOf(policies, inForce.versionId));
        const version = versionFromRules(rules, base);
        if (draft) {
          await repository.updateDraft(draft.id, version);
          return versionOf(await repository.findAll(), draft.id);
        }
        const policyId =
          inForce?.timeOffPolicyId ??
          (await repository.insertPolicy({ timeOffTypeId: timeOffType.id }));
        const id = await repository.insertVersion(policyId, {
          ...version,
          status: "draft",
          termsId,
        });
        return versionOf(await repository.findAll(), id);
      });
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

    async stopPolicy(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const { stopped, ...outcome } = await transact((tx) =>
        stopTermsPolicy(stopping, ctx, tx, input),
      ).catch((error: unknown) => {
        if (error instanceof ApplicationError) {
          logger.info({ ...input, code: error.code }, "Refused to stop offering a time off type");
        }
        throw error;
      });
      logger.info(
        {
          assignmentId: stopped.id,
          ...stopped.owner,
          timeOffTypeId: stopped.timeOffTypeId,
          ...outcome,
        },
        "Stopped offering a time off type",
      );
      return stopped;
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
        if (isPlannedStop(lane, removed, today())) {
          return { removed, ensured: await cancelTermsStop(stopping, ctx, tx, removed) };
        }
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

    readPublishSuggestions: (ctx, input) => readPublishSuggestions(publishing, ctx, input),
    publishTerms: (ctx, input) => publishTerms(publishing, ctx, input),
  };
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

/** The terms' assignment for the type covering `date`; null without one. */
async function termsRowOn(
  tx: Tx,
  termsId: string,
  timeOffTypeId: string,
  date: CalendarDate,
): Promise<PolicyAssignment | null> {
  const rows = (await timeOffPolicyRepository(tx).findAssignments({ termsIds: [termsId] })).filter(
    (row) => row.timeOffTypeId === timeOffTypeId,
  );
  return rows.find((row) => coversDate(row, date)) ?? null;
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
