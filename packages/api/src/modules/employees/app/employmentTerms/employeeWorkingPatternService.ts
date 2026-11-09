import { ApplicationError, invalidInput } from "../../../../core/applicationError";
import type { Transact, Tx } from "../../../../core/db";
import type { Logger } from "../../../../core/logger";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import { createRecordHistoryService, type HistoryLine } from "../../../../core/records";
import { isInRecordScope, type SecurityContext } from "../../../../core/security";
import {
  addDays,
  type CalendarDate,
  coversDate,
  parseUuid,
  todayInLondon,
} from "../../../../utils";
import {
  employeeRepository,
  employmentRepository,
  termsRepository,
  workingPatternRepository,
} from "../../db";
import {
  type DatedPattern,
  type TermsMembership,
  makeRoomForDatedRow,
  parseDateField,
  parseEmployeeIds,
  createPersonTimeline,
  type WorkingPattern,
  type WorkingPatternTimeline,
  type WorkingWeek,
  workingWeeksOf,
} from "../../domain";
import { employeeNotFound } from "../employeeNotFound";
import { readMemberships, type TermsMovePreview } from "./membershipsAfterMove";
import { publishWorkingPatternChange } from "./publishWorkingPatternChange";
import { type EmploymentTerms, readEmploymentTerms } from "./readEmploymentTerms";
import { referencedPattern } from "./workingPatternService";

const recordHistory = createRecordHistoryService();

/**
 * Who works which working pattern when: a person's own patterns from a date, and the working weeks
 * other modules read. Every change is dated; a past date is a correction.
 */
export interface EmployeeWorkingPatternService {
  /**
   * Each employee's working weeks from `from` to `until`, by id: the first starts on `from`, a new
   * one wherever minutes or calendar change. Refuses with FORBIDDEN an employee whose working
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
  /**
   * Each person's terms, earlier, today and planned, and their working week from today (or `from`)
   * on, marked as their terms' or their own, by id; with `move`, as they would be after it. People
   * the caller may not read are left out.
   */
  readEmploymentTerms: (
    ctx: SecurityContext,
    input: { employeeIds: readonly string[]; move?: TermsMovePreview; from?: CalendarDate },
  ) => Promise<Map<string, EmploymentTerms>>;
  readWorkingWeeksInTransaction: (
    tx: Tx,
    input: { employeeIds: readonly string[]; from: CalendarDate; until: CalendarDate },
  ) => Promise<Map<string, WorkingWeek[]>>;
  /**
   * Puts a person on a named pattern from a date, until a date or open-ended, ahead of their
   * terms'; an earlier one of theirs ends the day before. Refuses a terms' own pattern as invalid
   * input. Returns the history line it added.
   */
  assignPattern: (
    ctx: SecurityContext,
    input: {
      employeeId: string;
      workingPatternId: string;
      startDate: string;
      endDate?: string | null;
    },
  ) => Promise<HistoryLine>;
  /** Ends a person's own pattern on a date; their terms' applies from the next day. */
  endAssignment: (
    ctx: SecurityContext,
    input: { employeeId: string; endDate: string },
  ) => Promise<HistoryLine>;
  /** Removes a person's own pattern that starts on a date, as a correction. */
  removeAssignment: (
    ctx: SecurityContext,
    input: { employeeId: string; startDate: string },
  ) => Promise<HistoryLine>;
}

export function createEmployeeWorkingPatternService({
  transact,
  logger,
  today = todayInLondon,
}: Pick<ModuleDependencies, "transact" | "logger"> & {
  today?: () => CalendarDate;
}): EmployeeWorkingPatternService {
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

    readEmploymentTerms: (ctx, input) => readEmploymentTerms({ transact, today }, ctx, input),

    readWorkingWeeksInTransaction: readWorkingWeeksIn,

    async assignPattern(ctx, input) {
      const employeeId = await requireAssignmentWrite(ctx, input.employeeId);
      const startDate = parseDateField("startDate", input.startDate);
      const endDate =
        input.endDate == null ? null : parseUntil(startDate, input.endDate, "endDate");
      const change = { ctx, employeeId, changedFrom: startDate };
      return changeAssignments({ transact, logger }, change, async (tx, rows, patterns) => {
        const repository = workingPatternRepository(tx);
        const pattern = referencedPattern(patterns, input.workingPatternId);
        const { ended, replaced } = makeRoomForDatedRow(rows, startDate, endDate);
        if (replaced) {
          await repository.deleteAssignment(replaced.id);
        }
        if (ended) {
          await repository.endAssignment(ended.id, addDays(startDate, -1));
        }
        await repository.insertAssignment(employeeId, {
          workingPatternId: pattern.id,
          startDate,
          endDate,
        });
        return { before: replaced?.endDate ?? null, after: endDate };
      });
    },

    async endAssignment(ctx, input) {
      const employeeId = await requireAssignmentWrite(ctx, input.employeeId);
      const endDate = parseDateField("endDate", input.endDate);
      const change = { ctx, employeeId, changedFrom: addDays(endDate, 1) };
      return changeAssignments({ transact, logger }, change, async (tx, rows) => {
        const row = rows.find((candidate) => coversDate(candidate, endDate));
        if (!row) {
          throw noOwnPattern();
        }
        await workingPatternRepository(tx).endAssignment(row.id, endDate);
        return { before: row.endDate, after: endDate };
      });
    },

    async removeAssignment(ctx, input) {
      const employeeId = await requireAssignmentWrite(ctx, input.employeeId);
      const startDate = parseDateField("startDate", input.startDate);
      const change = { ctx, employeeId, changedFrom: startDate };
      return changeAssignments({ transact, logger }, change, async (tx, rows) => {
        const row = rows.find((candidate) => candidate.startDate === startDate);
        if (!row) {
          throw noOwnPattern();
        }
        await workingPatternRepository(tx).deleteAssignment(row.id);
        return { before: row.endDate, after: null };
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
    // Every pattern: the one a person is put on need not be one they are on yet.
    const patterns = await workingPatternRepository(tx).findPatterns();
    const end = await change(tx, before.assignments.get(employeeId) ?? [], patterns);
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
              oldValue: await patternNameOn(tx, before, employeeId, changedFrom),
              newValue: await patternNameOn(tx, after, employeeId, changedFrom),
            },
            { field: "startDate", oldValue: null, newValue: changedFrom },
            { field: "endDate", oldValue: end.before, newValue: end.after },
          ],
        },
      ],
    });
    return added!;
  });
  logger.info({ employeeId, startDate: changedFrom }, "Changed a person's working pattern");
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
  assignments: Map<string, DatedPattern[]>;
  memberships: Map<string, TermsMembership[]>;
  patterns: WorkingPattern[];
}

/**
 * Each employee's own patterns and their terms, with every pattern and its versions; with `move`,
 * their terms as they would be after it.
 */
export async function readTimelines(
  tx: Tx,
  employeeIds: readonly string[],
  move?: TermsMovePreview,
): Promise<Timelines> {
  const repository = workingPatternRepository(tx);
  // One after another: they share the transaction's connection.
  const assignments = await repository.findAssignments(employeeIds);
  const memberships = await readMemberships(tx, employeeIds, move);
  // Only the patterns these people are on, themselves or through their terms.
  const patterns = await repository.findPatterns({
    ids: unique([...assignments.values()].flat().map(({ workingPatternId }) => workingPatternId)),
    termsIds: unique([...memberships.values()].flat().map(({ termsId }) => termsId)),
  });
  const byId = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  const byTerms = new Map(
    patterns.flatMap(({ id, termsId }) => (termsId ? [[termsId, id] as const] : [])),
  );
  const timelines = new Map(
    employeeIds.map((id): [string, WorkingPatternTimeline] => [
      id,
      createPersonTimeline({
        direct: (assignments.get(id) ?? []).map((row) => ({ ...row, id: row.workingPatternId })),
        terms: memberships.get(id) ?? [],
        idOfTerms: (termsId) => byTerms.get(termsId) ?? null,
        versions: (patternId) => byId.get(patternId)?.versions ?? [],
      }),
    ]),
  );
  return { timelines, assignments, memberships, patterns };
}

/** The pattern's name on `date`; a terms' own pattern goes by the terms' name. */
async function patternNameOn(
  tx: Tx,
  { timelines, patterns }: Timelines,
  employeeId: string,
  date: CalendarDate,
): Promise<string | null> {
  const pattern = patterns.find(({ id }) => id === timelines.get(employeeId)!.getIdOnDate(date));
  if (!pattern?.termsId) {
    return pattern?.name ?? null;
  }
  return (await termsRepository(tx).findNames([pattern.termsId])).get(pattern.termsId) ?? null;
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

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
