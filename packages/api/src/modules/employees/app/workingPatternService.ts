import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import { createRecordHistoryService, type HistoryLine } from "../../../core/records";
import { isInRecordScope, type SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, parseUuid } from "../../../utils";
import { employeeRepository, policyGroupRepository, workingPatternRepository } from "../db";
import {
  covers,
  makeRoom,
  parseDateField,
  parseEmployeeIds,
  policyOn,
  type WorkingPatternTimeline,
  type WorkingWeek,
  workingWeeksOf,
} from "../domain";
import { employeeNotFound } from "./employeeNotFound";
import { publishWorkingPatternChange } from "./publishWorkingPatternChange";
import { referencedPolicy } from "./workingPatternPolicyService";

const recordHistory = createRecordHistoryService();

/**
 * Who works which working pattern when: groups and people put on policies from a date, and the
 * working weeks other modules read. Every change is dated; a past date is a correction.
 */
export interface WorkingPatternService {
  /**
   * Each employee's working weeks from `from` to `until`, by id: the first starts on `from`, a new
   * one wherever minutes or full day change. Refuses with FORBIDDEN an employee whose working
   * pattern the caller may not read, and with NOT_FOUND an id that names no employee.
   */
  readWorkingWeeks: (
    ctx: SecurityContext,
    input: { employeeIds: readonly string[]; from: string; until: string },
  ) => Promise<Map<string, WorkingWeek[]>>;
  /**
   * Puts a person on their own policy from a date, until a date or open-ended, ahead of their
   * group's; an earlier one of theirs ends the day before. Returns the history line it added.
   */
  assignPolicy: (
    ctx: SecurityContext,
    input: {
      employeeId: string;
      policyId: string;
      effectiveFrom: string;
      effectiveUntil?: string | null;
    },
  ) => Promise<HistoryLine>;
  /** Ends a person's own policy on a date; their group's applies from the next day. */
  endAssignment: (
    ctx: SecurityContext,
    input: { employeeId: string; effectiveUntil: string },
  ) => Promise<HistoryLine>;
  /** Removes a person's own policy that starts on a date, as a correction. */
  removeAssignment: (
    ctx: SecurityContext,
    input: { employeeId: string; effectiveFrom: string },
  ) => Promise<HistoryLine>;
}

export function createWorkingPatternService({
  orm,
  transact,
  logger,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger">): WorkingPatternService {
  return {
    async readWorkingWeeks(ctx, input) {
      const from = parseDateField("from", input.from);
      const until = parseUntil(from, input.until, "until");
      const employeeIds = parseEmployeeIds(input.employeeIds);
      const scope = await ctx.recordScope("working_pattern", "read");
      if (employeeIds.some((id) => !isInRecordScope(scope, id))) {
        throw new ApplicationError("FORBIDDEN", "You cannot read this working pattern.");
      }
      if ((await employeeRepository(orm).findByIds(employeeIds)).length < employeeIds.length) {
        throw employeeNotFound();
      }
      const timelines = await readTimelines(orm, employeeIds);
      return new Map(
        employeeIds.map((id) => [id, workingWeeksOf(timelines.get(id)!, from, until)]),
      );
    },

    async assignPolicy(ctx, input) {
      const employeeId = await requireAssignmentWrite(ctx, input.employeeId);
      const effectiveFrom = parseDateField("effectiveFrom", input.effectiveFrom);
      const effectiveUntil =
        input.effectiveUntil == null
          ? null
          : parseUntil(effectiveFrom, input.effectiveUntil, "effectiveUntil");
      return changeAssignments(ctx, employeeId, effectiveFrom, async (tx, rows) => {
        const patterns = workingPatternRepository(tx);
        const policy = referencedPolicy(await patterns.findPolicies(), input.policyId);
        const { ended, replaced } = makeRoom(rows, effectiveFrom, effectiveUntil);
        if (replaced) {
          await patterns.deleteAssignment(replaced.id);
        }
        if (ended) {
          await patterns.endAssignment(ended.id, addDays(effectiveFrom, -1));
        }
        await patterns.insertAssignment(employeeId, {
          policyId: policy.id,
          effectiveFrom,
          effectiveUntil,
        });
      });
    },

    async endAssignment(ctx, input) {
      const employeeId = await requireAssignmentWrite(ctx, input.employeeId);
      const effectiveUntil = parseDateField("effectiveUntil", input.effectiveUntil);
      return changeAssignments(ctx, employeeId, addDays(effectiveUntil, 1), async (tx, rows) => {
        const row = rows.find((candidate) => covers(candidate, effectiveUntil));
        if (!row) {
          throw noOwnPattern();
        }
        await workingPatternRepository(tx).endAssignment(row.id, effectiveUntil);
      });
    },

    async removeAssignment(ctx, input) {
      const employeeId = await requireAssignmentWrite(ctx, input.employeeId);
      const effectiveFrom = parseDateField("effectiveFrom", input.effectiveFrom);
      return changeAssignments(ctx, employeeId, effectiveFrom, async (tx, rows) => {
        const row = rows.find((candidate) => candidate.effectiveFrom === effectiveFrom);
        if (!row) {
          throw noOwnPattern();
        }
        await workingPatternRepository(tx).deleteAssignment(row.id);
      });
    },
  };

  /**
   * Changes one person's own dated policies in one transaction, then writes the history line
   * naming the policy that applied on `changedFrom` before and after, and publishes the change.
   */
  async function changeAssignments(
    ctx: SecurityContext,
    employeeId: string,
    changedFrom: CalendarDate,
    change: (tx: Tx, rows: Awaited<ReturnType<typeof ownRows>>) => Promise<void>,
  ): Promise<HistoryLine> {
    const line = await transact(async (tx) => {
      await workingPatternRepository(tx).lockForWrites();
      if (!(await employeeRepository(tx).findById(employeeId))) {
        throw employeeNotFound();
      }
      const before = await policyNameOn(tx, employeeId, changedFrom);
      await change(tx, await ownRows(tx, employeeId));
      const after = await policyNameOn(tx, employeeId, changedFrom);
      publishWorkingPatternChange(tx, [employeeId], changedFrom);
      const [added] = await recordHistory.append(ctx, tx, {
        recordType: "working_pattern",
        operation: "UPDATED",
        cause: { kind: "EDITED_DIRECTLY" },
        records: [
          {
            recordId: employeeId,
            changes: [
              { field: "workingPattern", oldValue: before, newValue: after },
              { field: "effectiveFrom", oldValue: null, newValue: changedFrom },
            ],
          },
        ],
      });
      return added!;
    });
    logger.info({ employeeId, effectiveFrom: changedFrom }, "Changed a person's working pattern");
    return line;
  }
}

/** The working pattern of each employee: their own policies, groups, and the policies' weeks. */
async function readTimelines(
  db: Orm | Tx,
  employeeIds: readonly string[],
): Promise<Map<string, WorkingPatternTimeline>> {
  const patterns = workingPatternRepository(db);
  const [assignments, memberships, policies] = await Promise.all([
    patterns.findAssignments(employeeIds),
    policyGroupRepository(db).findMemberships(employeeIds),
    patterns.findPolicies(),
  ]);
  const groupIds = [...memberships.values()].flat().map(({ policyGroupId }) => policyGroupId);
  const groupPolicies = await patterns.findGroupPolicies([...new Set(groupIds)]);
  const policyWeeks = new Map(policies.map(({ id, weeks }) => [id, weeks]));
  return new Map(
    employeeIds.map((id) => [
      id,
      {
        assignments: assignments.get(id) ?? [],
        memberships: memberships.get(id) ?? [],
        groupPolicies,
        policyWeeks,
      },
    ]),
  );
}

async function policyNameOn(tx: Tx, employeeId: string, date: CalendarDate) {
  const timeline = (await readTimelines(tx, [employeeId])).get(employeeId)!;
  const policyId = policyOn(timeline, date);
  const policies = await workingPatternRepository(tx).findPolicies();
  return policies.find(({ id }) => id === policyId)?.name ?? null;
}

async function ownRows(tx: Tx, employeeId: string) {
  return (await workingPatternRepository(tx).findAssignments([employeeId])).get(employeeId) ?? [];
}

async function requireAssignmentWrite(ctx: SecurityContext, employeeId: string) {
  const id = parseUuid(employeeId);
  if (!id) {
    throw employeeNotFound();
  }
  await ctx.requireInScope("working_pattern", "update", id);
  return id;
}

function parseUntil(from: CalendarDate, value: string, field: string): CalendarDate {
  const until = parseDateField(field, value);
  if (until < from) {
    throw invalidInput([{ field, code: "before_start" }]);
  }
  return until;
}

function noOwnPattern(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "The person has no working pattern of their own here.");
}
