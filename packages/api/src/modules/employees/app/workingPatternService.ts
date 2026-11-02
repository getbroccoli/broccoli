import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Transact, Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import { createRecordHistoryService, type HistoryLine } from "../../../core/records";
import { isInRecordScope, type SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, parseUuid } from "../../../utils";
import {
  employeeRepository,
  employmentRepository,
  policyGroupRepository,
  workingPatternRepository,
} from "../db";
import {
  coversDate,
  type DatedPolicy,
  makeRoomForDatedPolicy,
  parseDateField,
  parseEmployeeIds,
  policyOn,
  type WorkingPatternPolicy,
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
  transact,
  logger,
}: Pick<ModuleDependencies, "transact" | "logger">): WorkingPatternService {
  return {
    async readWorkingWeeks(ctx, input) {
      const from = parseDateField("from", input.from);
      const until = parseUntil(from, input.until, "until");
      const employeeIds = parseEmployeeIds(input.employeeIds);
      const scope = await ctx.recordScope("working_pattern", "read");
      if (employeeIds.some((id) => !isInRecordScope(scope, id))) {
        throw new ApplicationError("FORBIDDEN", "You cannot read this working pattern.");
      }
      const { timelines } = await transact(async (tx) => {
        await workingPatternRepository(tx).lockForReads();
        if ((await employeeRepository(tx).findByIds(employeeIds)).length < employeeIds.length) {
          throw employeeNotFound();
        }
        return readTimelines(tx, employeeIds);
      });
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
      const change = { ctx, employeeId, changedFrom: effectiveFrom };
      return changeAssignments({ transact, logger }, change, async (tx, rows) => {
        const patterns = workingPatternRepository(tx);
        const policy = referencedPolicy(await patterns.findPolicies(), input.policyId);
        const { ended, replaced } = makeRoomForDatedPolicy(rows, effectiveFrom, effectiveUntil);
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
      const change = { ctx, employeeId, changedFrom: addDays(effectiveUntil, 1) };
      return changeAssignments({ transact, logger }, change, async (tx, rows) => {
        const row = rows.find((candidate) => coversDate(candidate, effectiveUntil));
        if (!row) {
          throw noOwnPattern();
        }
        await workingPatternRepository(tx).endAssignment(row.id, effectiveUntil);
      });
    },

    async removeAssignment(ctx, input) {
      const employeeId = await requireAssignmentWrite(ctx, input.employeeId);
      const effectiveFrom = parseDateField("effectiveFrom", input.effectiveFrom);
      const change = { ctx, employeeId, changedFrom: effectiveFrom };
      return changeAssignments({ transact, logger }, change, async (tx, rows) => {
        const row = rows.find((candidate) => candidate.effectiveFrom === effectiveFrom);
        if (!row) {
          throw noOwnPattern();
        }
        await workingPatternRepository(tx).deleteAssignment(row.id);
      });
    },
  };
}

/**
 * Changes one person's own dated policies in one transaction, then writes the history line
 * naming the policy that applied on `changedFrom` before and after, and publishes the change.
 */
async function changeAssignments(
  { transact, logger }: { transact: Transact; logger: Logger },
  { ctx, employeeId, changedFrom }: AssignmentChange,
  change: (tx: Tx, rows: DatedPolicy[]) => Promise<void>,
): Promise<HistoryLine> {
  const line = await transact(async (tx) => {
    // The employee write lock first, as deleting an employee takes it, so the two cannot deadlock.
    await employmentRepository(tx).lockForWrites();
    await workingPatternRepository(tx).lockForWrites();
    if (!(await employeeRepository(tx).findById(employeeId))) {
      throw employeeNotFound();
    }
    const before = await readTimelines(tx, [employeeId]);
    await change(tx, before.timelines.get(employeeId)!.assignments.slice());
    const after = await readTimelines(tx, [employeeId]);
    publishWorkingPatternChange(tx, [employeeId], changedFrom);
    const [added] = await recordHistory.append(ctx, tx, {
      recordType: "working_pattern",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [
        {
          recordId: employeeId,
          changes: [
            {
              field: "workingPattern",
              oldValue: policyNameOn(before, employeeId, changedFrom),
              newValue: policyNameOn(after, employeeId, changedFrom),
            },
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

interface AssignmentChange {
  ctx: SecurityContext;
  employeeId: string;
  /** The first date whose working pattern the change may move. */
  changedFrom: CalendarDate;
}

interface Timelines {
  timelines: Map<string, WorkingPatternTimeline>;
  policies: WorkingPatternPolicy[];
}

/**
 * Each employee's working pattern: their own policies, their groups with those groups' policies,
 * and the weeks of the policies these name; with every policy.
 */
async function readTimelines(tx: Tx, employeeIds: readonly string[]): Promise<Timelines> {
  const patterns = workingPatternRepository(tx);
  // One after another: they share the transaction's connection.
  const assignments = await patterns.findAssignments(employeeIds);
  const memberships = await policyGroupRepository(tx).findMemberships(employeeIds);
  const policies = await patterns.findPolicies();
  const groupIds = [...memberships.values()].flat().map(({ policyGroupId }) => policyGroupId);
  const groupPolicies = await patterns.findGroupPolicies([...new Set(groupIds)]);
  const weeksOf = new Map(policies.map(({ id, weeks }) => [id, weeks]));
  const timelines = new Map(
    employeeIds.map((id) => {
      const own = memberships.get(id) ?? [];
      const theirGroups = new Map(
        own.map(({ policyGroupId }) => [policyGroupId, groupPolicies.get(policyGroupId) ?? []]),
      );
      const rows = [...(assignments.get(id) ?? []), ...[...theirGroups.values()].flat()];
      const policyWeeks = new Map(rows.map(({ policyId }) => [policyId, weeksOf.get(policyId)!]));
      return [
        id,
        {
          assignments: assignments.get(id) ?? [],
          memberships: own,
          groupPolicies: theirGroups,
          policyWeeks,
        },
      ];
    }),
  );
  return { timelines, policies };
}

function policyNameOn({ timelines, policies }: Timelines, employeeId: string, date: CalendarDate) {
  const policyId = policyOn(timelines.get(employeeId)!, date);
  return policies.find(({ id }) => id === policyId)?.name ?? null;
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
