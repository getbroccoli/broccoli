import { ApplicationError, invalidInput } from "../../../../core/applicationError";
import type { Tx } from "../../../../core/db";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { SecurityContext } from "../../../../core/security";
import { type CalendarDate, coversDate, parseUuid, todayInLondon } from "../../../../utils";
import { parseBankHolidayCalendar } from "../../../bankHolidays";
import { termsRepository, workingPatternRepository } from "../../db";
import {
  type Assignment,
  type AssignmentOwner,
  type AssignmentPlan,
  cancelPlannedVersion,
  isSameOwner,
  type PatternVersion,
  parseWeek,
  plannedRowsReplaced,
  type WeekdayMinutes,
} from "../../domain";
import { publishWorkingPatternChange } from "./publishWorkingPatternChange";
import { appendWorkingWeekHistory } from "./workingWeekHistory";
import {
  applyAssignmentPlan,
  employeesOf,
  ownerIds,
  ownersOf,
  readReach,
} from "./workingWeekPublish";

/**
 * The working weeks admins keep on terms: an unpublished week saved and discarded, a planned one
 * cancelled, and, for time off's Publish, what publishing one would do and doing it.
 */
export interface WorkingPatternService {
  /**
   * Creates these terms' unpublished working week, from the pattern they work today, or saves it
   * again one revision later. Nobody's week changes. Admins only.
   */
  saveWorkingPattern: (
    ctx: SecurityContext,
    input: { termsId: string; minutes: WeekdayMinutes; bankHolidayCalendar: string },
  ) => Promise<PatternVersion>;
  /** Deletes an unpublished week; a pattern left without versions goes too. Admins only. */
  discardWorkingPattern: (ctx: SecurityContext, input: { versionId: string }) => Promise<void>;
  /**
   * Removes a working week assignment that starts after today; the one ending the day before runs
   * to its end. CONFLICT once it has started. Adds a line to its owner's history. Admins only.
   */
  cancelWorkingPatternChange: (
    ctx: SecurityContext,
    input: { assignmentId: string },
  ) => Promise<void>;
  /**
   * Trusted, for time off's Publish, in its transaction: the terms' unpublished week, the version
   * it replaces from `from` and every owner using that one, these terms first, each with the
   * employees publishing to it would reach; null without an unpublished week.
   */
  readPublish: (
    tx: Tx,
    input: { termsId: string; from: CalendarDate },
  ) => Promise<WorkingPatternPublish | null>;
  /**
   * Trusted, for time off's Publish, in its transaction: publishes the terms' unpublished week and
   * gives it to each of `owners` from `from` in place of the version it replaces, with a history
   * line each. Returns the employees whose week may have changed.
   */
  publish: (
    ctx: SecurityContext,
    tx: Tx,
    input: { termsId: string; from: CalendarDate; owners: readonly AssignmentOwner[] },
  ) => Promise<{ employeeIds: string[] }>;
}

/** What publishing a set of terms' working week from a date would do. */
export interface WorkingPatternPublish {
  version: PatternVersion;
  owners: { owner: AssignmentOwner; reachedIds: string[] }[];
}

export function createWorkingPatternService({
  transact,
  logger,
  today = todayInLondon,
}: Pick<ModuleDependencies, "transact" | "logger"> & {
  today?: () => CalendarDate;
}): WorkingPatternService {
  return {
    async saveWorkingPattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const termsId = parseUuid(input.termsId);
      const week = {
        ...parseWeek(input),
        bankHolidayCalendar: parseBankHolidayCalendar(input.bankHolidayCalendar),
      };
      const saved = await transact(async (tx) => {
        const repository = workingPatternRepository(tx);
        await repository.lockForWrites();
        if (!termsId || !(await termsRepository(tx).keep(termsId))) {
          throw invalidInput([{ field: "termsId", code: "not_found" }]);
        }
        const versions = (await repository.findPatterns()).flatMap(({ versions: all }) => all);
        const draft = draftOf(versions, termsId);
        if (draft) {
          await repository.updateDraft(draft.id, week);
          return findVersionIn(tx, draft.id);
        }
        const patternId =
          (await patternWorkedBy(tx, versions, termsId, today())) ??
          (await repository.insertPattern(null));
        const id = await repository.insertVersion(patternId, { ...week, status: "draft", termsId });
        return findVersionIn(tx, id);
      });
      logger.info(
        { termsId, workingPatternVersionId: saved.id, revision: saved.revision },
        "Saved an unpublished working week",
      );
      return saved;
    },

    async discardWorkingPattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const versionId = parseUuid(input.versionId);
      const termsId = await transact(async (tx) => {
        const repository = workingPatternRepository(tx);
        await repository.lockForWrites();
        const pattern = (await repository.findPatterns()).find(({ versions }) =>
          versions.some(({ id, status }) => id === versionId && status === "draft"),
        );
        if (!pattern) {
          throw new ApplicationError("NOT_FOUND", "No unpublished working week has this id.");
        }
        await repository.deleteVersion(versionId!);
        if (pattern.versions.length === 1) {
          await repository.deletePattern(pattern.id);
        }
        return pattern.versions.find(({ id }) => id === versionId)!.termsId;
      });
      logger.info({ termsId, workingPatternVersionId: versionId }, "Discarded a working week");
    },

    async cancelWorkingPatternChange(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const assignmentId = parseUuid(input.assignmentId);
      const removed = await transact(async (tx) => {
        const repository = workingPatternRepository(tx);
        await repository.lockForWrites();
        const assignment = await findAssignment(tx, assignmentId);
        const lane = await repository.findAssignments(ownerIds(assignment.owner));
        const { extended } = cancelPlannedVersion(lane, assignment.startDate, today());
        await repository.deleteAssignment(assignment.id);
        if (extended) {
          await repository.endAssignment(extended.id, assignment.endDate);
        }
        const week = await findVersionIn(tx, assignment.versionId);
        await appendWorkingWeekHistory(
          ctx,
          tx,
          assignment.owner,
          { ...week, startDate: assignment.startDate },
          null,
        );
        publishWorkingPatternChange(
          tx,
          await employeesOf(tx, assignment.owner),
          assignment.startDate,
        );
        return assignment;
      });
      logger.info(
        { assignmentId: removed.id, ...removed.owner, startDate: removed.startDate },
        "Cancelled a working week change",
      );
    },

    async readPublish(tx, { termsId, from }) {
      const repository = workingPatternRepository(tx);
      await repository.lockForReads();
      const versions = (await repository.findPatterns()).flatMap(({ versions: all }) => all);
      const draft = draftOf(versions, termsId);
      if (!draft) {
        return null;
      }
      const owners = await ownersOf(tx, termsId, draft, versions, from);
      const reached = [];
      // One after another: they share the transaction's connection.
      for (const { owner, lane, plan } of owners) {
        const reachedIds = plan ? await readReach(tx, owner, lane, plan, draft.id, from) : [];
        reached.push({ owner, reachedIds });
      }
      return { version: draft, owners: reached };
    },

    async publish(ctx, tx, { termsId, from, owners }) {
      const repository = workingPatternRepository(tx);
      await repository.lockForWrites();
      const versions = (await repository.findPatterns()).flatMap(({ versions: all }) => all);
      const draft = draftOf(versions, termsId)!;
      const suggested = await ownersOf(tx, termsId, draft, versions, from);
      const employeeIds = new Set<string>();
      for (const { owner, lane, plan, refusal, replaced } of suggested) {
        if (!owners.some((ticked) => isSameOwner(ticked, owner))) {
          continue;
        }
        if (!plan) {
          throw refusal;
        }
        await applyAssignmentPlan(repository, plan, (span) =>
          repository.insertAssignment({ ...span, versionId: draft.id, owner }),
        );
        await appendPublishHistory(ctx, tx, { owner, lane, plan, replaced, draft, versions, from });
        for (const id of await employeesOf(tx, owner)) employeeIds.add(id);
      }
      await repository.publishVersion(draft.id);
      publishWorkingPatternChange(tx, [...employeeIds], from);
      logger.info(
        {
          termsId,
          workingPatternVersionId: draft.id,
          startDate: from,
          ownerCount: owners.length,
          employeeCount: employeeIds.size,
        },
        "Published a working week",
      );
      return { employeeIds: [...employeeIds] };
    },
  };
}

/** The terms' unpublished version, if any. */
function draftOf(versions: readonly PatternVersion[], termsId: string): PatternVersion | null {
  return (
    versions.find((version) => version.status === "draft" && version.termsId === termsId) ?? null
  );
}

/**
 * The pattern the terms work on `date`, else the one they start on later, as a first week planned
 * for a later date; null when they have none.
 */
async function patternWorkedBy(
  tx: Tx,
  versions: readonly PatternVersion[],
  termsId: string,
  date: CalendarDate,
): Promise<string | null> {
  const rows = await workingPatternRepository(tx).findAssignments({ termsIds: [termsId] });
  const row =
    rows.find((candidate) => coversDate(candidate, date)) ??
    rows.find(({ startDate }) => startDate > date);
  return row ? versions.find(({ id }) => id === row.versionId)!.workingPatternId : null;
}

async function findAssignment(tx: Tx, assignmentId: string | null): Promise<Assignment> {
  const rows = assignmentId
    ? await workingPatternRepository(tx).findAssignmentsById([assignmentId])
    : [];
  if (!rows[0]) {
    throw new ApplicationError("NOT_FOUND", "No working week change has this id.");
  }
  return rows[0];
}

async function findVersionIn(tx: Tx, versionId: string): Promise<PatternVersion> {
  const patterns = await workingPatternRepository(tx).findPatterns();
  return patterns.flatMap(({ versions }) => versions).find(({ id }) => id === versionId)!;
}

/**
 * The owner's history for a publish: the week the draft takes over and the new one from where it
 * starts, then each later planned week the publish replaced, as cancelled.
 */
async function appendPublishHistory(
  ctx: SecurityContext,
  tx: Tx,
  {
    owner,
    lane,
    plan,
    replaced,
    draft,
    versions,
    from,
  }: {
    owner: AssignmentOwner;
    lane: readonly Assignment[];
    plan: AssignmentPlan;
    replaced: Assignment | null;
    draft: PatternVersion;
    versions: readonly PatternVersion[];
    from: CalendarDate;
  },
) {
  const weekOf = ({ versionId, startDate }: Assignment) => ({
    ...versions.find(({ id }) => id === versionId)!,
    startDate,
  });
  await appendWorkingWeekHistory(ctx, tx, owner, replaced && weekOf(replaced), {
    ...draft,
    startDate: plan.added[0]?.startDate ?? from,
  });
  for (const planned of plannedRowsReplaced(lane, plan)) {
    await appendWorkingWeekHistory(ctx, tx, owner, weekOf(planned), null);
  }
}
