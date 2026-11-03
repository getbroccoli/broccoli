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
  type DatedPattern,
  makeRoomForDatedPattern,
  parseDateField,
  parseEmployeeIds,
  patternOn,
  type WorkingPattern,
  type WorkingPatternTimeline,
  type WorkingWeek,
  workingWeeksOf,
} from "../domain";
import { employeeNotFound } from "./employeeNotFound";
import { publishWorkingPatternChange } from "./publishWorkingPatternChange";
import { referencedPattern } from "./workingPatternService";

const recordHistory = createRecordHistoryService();

/**
 * Who works which working pattern when: a person's own patterns from a date, and the working weeks
 * other modules read. Every change is dated; a past date is a correction.
 */
export interface EmployeeWorkingPatternService {
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
   * Trusted, for time off: `readWorkingWeeks` in the caller's transaction, so it sees people that
   * transaction created; checks no caller and assumes every id names an employee.
   */
  readWorkingWeeksInTransaction: (
    tx: Tx,
    input: { employeeIds: readonly string[]; from: CalendarDate; until: CalendarDate },
  ) => Promise<Map<string, WorkingWeek[]>>;
  /**
   * Puts a person on their own pattern from a date, until a date or open-ended, ahead of their
   * group's; an earlier one of theirs ends the day before. Returns the history line it added.
   */
  assignPattern: (
    ctx: SecurityContext,
    input: {
      employeeId: string;
      workingPatternId: string;
      effectiveFrom: string;
      effectiveUntil?: string | null;
    },
  ) => Promise<HistoryLine>;
  /** Ends a person's own pattern on a date; their group's applies from the next day. */
  endAssignment: (
    ctx: SecurityContext,
    input: { employeeId: string; effectiveUntil: string },
  ) => Promise<HistoryLine>;
  /** Removes a person's own pattern that starts on a date, as a correction. */
  removeAssignment: (
    ctx: SecurityContext,
    input: { employeeId: string; effectiveFrom: string },
  ) => Promise<HistoryLine>;
}

export function createEmployeeWorkingPatternService({
  transact,
  logger,
}: Pick<ModuleDependencies, "transact" | "logger">): EmployeeWorkingPatternService {
  return {
    async readWorkingWeeks(ctx, input) {
      const from = parseDateField("from", input.from);
      const until = parseUntil(from, input.until, "until");
      const employeeIds = parseEmployeeIds(input.employeeIds);
      const scope = await ctx.recordScope("working_pattern", "read");
      if (employeeIds.some((id) => !isInRecordScope(scope, id))) {
        throw new ApplicationError("FORBIDDEN", "You cannot read this working pattern.");
      }
      return transact(async (tx) => {
        if ((await employeeRepository(tx).findByIds(employeeIds)).length < employeeIds.length) {
          throw employeeNotFound();
        }
        return readWorkingWeeksIn(tx, { employeeIds, from, until });
      });
    },

    readWorkingWeeksInTransaction: readWorkingWeeksIn,

    async assignPattern(ctx, input) {
      const employeeId = await requireAssignmentWrite(ctx, input.employeeId);
      const effectiveFrom = parseDateField("effectiveFrom", input.effectiveFrom);
      const effectiveUntil =
        input.effectiveUntil == null
          ? null
          : parseUntil(effectiveFrom, input.effectiveUntil, "effectiveUntil");
      const change = { ctx, employeeId, changedFrom: effectiveFrom };
      return changeAssignments({ transact, logger }, change, async (tx, rows, patterns) => {
        const repository = workingPatternRepository(tx);
        const pattern = referencedPattern(patterns, input.workingPatternId);
        const { ended, replaced } = makeRoomForDatedPattern(rows, effectiveFrom, effectiveUntil);
        if (replaced) {
          await repository.deleteAssignment(replaced.id);
        }
        if (ended) {
          await repository.endAssignment(ended.id, addDays(effectiveFrom, -1));
        }
        await repository.insertAssignment(employeeId, {
          workingPatternId: pattern.id,
          effectiveFrom,
          effectiveUntil,
        });
        return { before: replaced?.effectiveUntil ?? null, after: effectiveUntil };
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
        return { before: row.effectiveUntil, after: effectiveUntil };
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
        return { before: row.effectiveUntil, after: null };
      });
    },
  };
}

async function readWorkingWeeksIn(
  tx: Tx,
  {
    employeeIds,
    from,
    until,
  }: { employeeIds: readonly string[]; from: CalendarDate; until: CalendarDate },
): Promise<Map<string, WorkingWeek[]>> {
  await workingPatternRepository(tx).lockForReads();
  const { timelines } = await readTimelines(tx, employeeIds);
  return new Map(employeeIds.map((id) => [id, workingWeeksOf(timelines.get(id)!, from, until)]));
}

/**
 * Changes one person's own dated patterns in one transaction, then writes the history line
 * naming the pattern that applied on `changedFrom` before and after, with the end date the change
 * moved, and publishes the change.
 */
async function changeAssignments(
  { transact, logger }: { transact: Transact; logger: Logger },
  { ctx, employeeId, changedFrom }: AssignmentChange,
  change: (tx: Tx, rows: DatedPattern[], patterns: WorkingPattern[]) => Promise<EndChange>,
): Promise<HistoryLine> {
  const line = await transact(async (tx) => {
    // The employee write lock first, as deleting an employee takes it, so the two cannot deadlock.
    await employmentRepository(tx).lockForWrites();
    await workingPatternRepository(tx).lockForWrites();
    if (!(await employeeRepository(tx).findById(employeeId))) {
      throw employeeNotFound();
    }
    const before = await readTimelines(tx, [employeeId]);
    const end = await change(
      tx,
      before.timelines.get(employeeId)!.assignments.slice(),
      before.patterns,
    );
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
              oldValue: patternNameOn(before, employeeId, changedFrom),
              newValue: patternNameOn(after, employeeId, changedFrom),
            },
            { field: "effectiveFrom", oldValue: null, newValue: changedFrom },
            { field: "effectiveUntil", oldValue: end.before, newValue: end.after },
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

/** The end date of the person's own pattern a change moved, before and after; null: none or open. */
interface EndChange {
  before: CalendarDate | null;
  after: CalendarDate | null;
}

interface Timelines {
  timelines: Map<string, WorkingPatternTimeline>;
  patterns: WorkingPattern[];
}

/**
 * Each employee's working pattern: their own patterns, their groups with those groups' patterns,
 * and the weeks of the patterns these name; with every pattern.
 */
async function readTimelines(tx: Tx, employeeIds: readonly string[]): Promise<Timelines> {
  const repository = workingPatternRepository(tx);
  // One after another: they share the transaction's connection.
  const assignments = await repository.findAssignments(employeeIds);
  const memberships = await policyGroupRepository(tx).findMemberships(employeeIds);
  const patterns = await repository.findPatterns();
  const groupIds = [...memberships.values()].flat().map(({ policyGroupId }) => policyGroupId);
  const groupPatterns = await repository.findGroupLinks([...new Set(groupIds)]);
  const weeksOf = new Map(patterns.map(({ id, weeks }) => [id, weeks]));
  const timelines = new Map(
    employeeIds.map((id) => {
      const own = memberships.get(id) ?? [];
      const theirGroups = new Map(
        own.map(({ policyGroupId }) => [policyGroupId, groupPatterns.get(policyGroupId) ?? []]),
      );
      const rows = [...(assignments.get(id) ?? []), ...[...theirGroups.values()].flat()];
      const patternWeeks = new Map(
        rows.map(({ workingPatternId }) => [workingPatternId, weeksOf.get(workingPatternId)!]),
      );
      return [
        id,
        {
          assignments: assignments.get(id) ?? [],
          memberships: own,
          groupPatterns: theirGroups,
          patternWeeks,
        },
      ];
    }),
  );
  return { timelines, patterns };
}

function patternNameOn({ timelines, patterns }: Timelines, employeeId: string, date: CalendarDate) {
  const workingPatternId = patternOn(timelines.get(employeeId)!, date);
  return patterns.find(({ id }) => id === workingPatternId)?.name ?? null;
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
