import { eq } from "drizzle-orm";

import type { Orm } from "../../src/core/db";
import { employeeTerms, terms } from "../../src/modules/employees/db";
import { parseCalendarDate } from "../../src/utils";
import { calendarDate } from "./calendarDate";

export async function defaultTermsId(orm: Orm): Promise<string> {
  const [defaultTerms] = await orm
    .select({ id: terms.id })
    .from(terms)
    .where(eq(terms.key, "default_terms"));
  return defaultTerms!.id;
}

export async function insertTerms(orm: Orm, name: string): Promise<string> {
  const [inserted] = await orm.insert(terms).values({ name }).returning({ id: terms.id });
  return inserted!.id;
}

export async function leaveTerms(orm: Orm, employeeId: string): Promise<void> {
  await orm.delete(employeeTerms).where(eq(employeeTerms.employeeId, employeeId));
}

export async function moveToTerms(
  orm: Orm,
  { employeeId, termsId, from }: { employeeId: string; termsId: string; from: string | null },
): Promise<void> {
  await leaveTerms(orm, employeeId);
  await orm.insert(employeeTerms).values({
    employeeId,
    termsId,
    startDate: from === null ? null : parseCalendarDate(from)!,
  });
}

/** Replaces a person's memberships so tests can arrange past and planned moves without a move service. */
export async function seedTermsPeriods(
  orm: Orm,
  employeeId: string,
  periods: { termsId: string; startDate: string | null; endDate: string | null }[],
): Promise<void> {
  await leaveTerms(orm, employeeId);
  await orm.insert(employeeTerms).values(
    periods.map(({ termsId, startDate, endDate }) => ({
      employeeId,
      termsId,
      startDate: startDate === null ? null : calendarDate(startDate),
      endDate: endDate === null ? null : calendarDate(endDate),
    })),
  );
}
