import type { Transact } from "../../../../core/db";
import { isInRecordScope, type SecurityContext } from "../../../../core/security";
import { type CalendarDate, parseUuid } from "../../../../utils";
import { termsRepository, workingPatternRepository } from "../../db";
import { type PatternVersion, type PersonVersion, personVersionsFrom } from "../../domain";
import { readTimelines } from "./employeeWorkingPatternService";

/** A person's terms, earlier, today and planned, and their working week from today on. */
export interface EmploymentTerms {
  employeeId: string;
  /** Every row of the person's terms, oldest first. */
  periods: TermsPeriod[];
  /** The week applying today first, then each later change. */
  workingWeek: PersonWorkingWeek[];
}

/** A working week as it applies to one person from a date until the next change. */
export type PersonWorkingWeek = PersonVersion<PatternVersion>;

/** One stretch of a person on one set of terms. */
export interface TermsPeriod {
  termsId: string;
  termsName: string;
  /** Null: since their employment started. */
  startDate: CalendarDate | null;
  /** Null: still on these terms. */
  endDate: CalendarDate | null;
}

/**
 * Each in-scope person's terms and working week, by id; ids the caller may not read are left
 * out, as a field that reads null.
 */
export async function readEmploymentTerms(
  { transact, today }: { transact: Transact; today: () => CalendarDate },
  ctx: SecurityContext,
  input: { employeeIds: readonly string[] },
): Promise<Map<string, EmploymentTerms>> {
  const scope = await ctx.recordScope("working_pattern", "read");
  const ids = [...new Set(input.employeeIds.map(parseUuid))].filter(
    (id): id is string => id !== null && isInRecordScope(scope, id),
  );
  if (ids.length === 0) return new Map();
  return transact(async (tx) => {
    await workingPatternRepository(tx).lockForReads();
    const { timelines, memberships, patterns } = await readTimelines(tx, ids);
    const termsIds = [...memberships.values()].flat().map(({ termsId }) => termsId);
    const names = await termsRepository(tx).findNames([...new Set(termsIds)]);
    const termsPatternIds = new Set(patterns.filter((p) => p.termsId).map(({ id }) => id));
    return new Map(
      ids.map((id) => [
        id,
        {
          employeeId: id,
          periods: (memberships.get(id) ?? [])
            .map(({ termsId, startDate, endDate }) => ({
              termsId,
              termsName: names.get(termsId) ?? "",
              startDate,
              endDate,
            }))
            .toSorted(byStartDate),
          workingWeek: personVersionsFrom(timelines.get(id)!, today(), (patternId) =>
            termsPatternIds.has(patternId),
          ),
        },
      ]),
    );
  });
}

// A period without a start date began with the employment, before every other.
function byStartDate(a: TermsPeriod, b: TermsPeriod): number {
  return (a.startDate ?? "").localeCompare(b.startDate ?? "");
}
