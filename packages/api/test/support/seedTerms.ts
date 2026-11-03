import { eq } from "drizzle-orm";

import type { Orm } from "../../src/core/db";
import { employeeTerms, terms } from "../../src/modules/employees/db";
import { parseCalendarDate } from "../../src/utils";

export async function englandAndWalesTermsId(orm: Orm): Promise<string> {
  const [everyone] = await orm
    .select({ id: terms.id })
    .from(terms)
    .where(eq(terms.key, "england_and_wales"));
  return everyone!.id;
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
    effectiveFrom: from === null ? null : parseCalendarDate(from)!,
  });
}
