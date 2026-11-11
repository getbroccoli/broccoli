import { ApplicationError, invalidInput } from "../../../../core/applicationError";
import type { Tx } from "../../../../core/db";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import { isInRecordScope, type SecurityContext } from "../../../../core/security";
import { type CalendarDate, todayInLondon } from "../../../../utils";
import { employeeRepository, workingPatternRepository } from "../../db";
import {
  type Assignment,
  createPersonTimeline,
  type PatternVersion,
  parseDateField,
  parseEmployeeIds,
  type TermsMembership,
  type WorkingPatternTimeline,
  type WorkingWeek,
  workingWeeksOf,
} from "../../domain";
import { employeeNotFound } from "../employeeNotFound";
import { readMemberships, type TermsMovePreview } from "./membershipsAfterMove";
import { type EmploymentTerms, readEmploymentTerms } from "./readEmploymentTerms";

/** Who works which working week when, as other modules and a person's panel read it. */
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
   * Each person's terms, earlier, today and planned, and their working week from today (or `from`)
   * on, marked as their terms' or their own, by id; with `move`, as they would be after it. People
   * the caller may not read are left out.
   */
  readEmploymentTerms: (
    ctx: SecurityContext,
    input: { employeeIds: readonly string[]; move?: TermsMovePreview; from?: CalendarDate },
  ) => Promise<Map<string, EmploymentTerms>>;
  /**
   * Trusted, for time off: `readWorkingWeeks` in the caller's transaction, so it sees people that
   * transaction created; checks no caller and assumes every id names an employee.
   */
  readWorkingWeeksInTransaction: (
    tx: Tx,
    input: { employeeIds: readonly string[]; from: CalendarDate; until: CalendarDate },
  ) => Promise<Map<string, WorkingWeek[]>>;
}

export function createEmployeeWorkingPatternService({
  transact,
  today = todayInLondon,
}: Pick<ModuleDependencies, "transact"> & {
  today?: () => CalendarDate;
}): EmployeeWorkingPatternService {
  return {
    async readWorkingWeeks(ctx, input) {
      const from = parseDateField("from", input.from);
      const until = parseDateField("until", input.until);
      if (until < from) {
        throw invalidInput([{ field: "until", code: "before_start" }]);
      }
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

interface Timelines {
  timelines: Map<string, WorkingPatternTimeline>;
  memberships: Map<string, TermsMembership[]>;
}

/**
 * Each employee's working pattern timeline: their own assignments and their terms', with every
 * version; with `move`, their terms as they would be after it. `assignments` replaces some owners'
 * stored rows, as a publish would leave them.
 */
export async function readTimelines(
  tx: Tx,
  employeeIds: readonly string[],
  move?: TermsMovePreview,
  assignments?: (stored: Assignment[]) => Assignment[],
): Promise<Timelines> {
  const repository = workingPatternRepository(tx);
  // One after another: they share the transaction's connection.
  const memberships = await readMemberships(tx, employeeIds, move);
  const termsIds = [...new Set([...memberships.values()].flat().map(({ termsId }) => termsId))];
  const stored = await repository.findAssignments({ employeeIds, termsIds });
  const rows = assignments ? assignments(stored) : stored;
  const versions = new Map<string, PatternVersion>(
    (await repository.findPatterns()).flatMap(({ versions: all }) => all.map((v) => [v.id, v])),
  );
  const ofOwner = Map.groupBy(rows, ({ owner }) =>
    "employeeId" in owner ? `employee:${owner.employeeId}` : `terms:${owner.termsId}`,
  );
  const timelines = new Map(
    employeeIds.map((id): [string, WorkingPatternTimeline] => [
      id,
      createPersonTimeline({
        direct: ofOwner.get(`employee:${id}`) ?? [],
        terms: memberships.get(id) ?? [],
        termsAssignments: (termsId) => ofOwner.get(`terms:${termsId}`) ?? [],
        version: (versionId) => versions.get(versionId)!,
      }),
    ]),
  );
  return { timelines, memberships };
}
