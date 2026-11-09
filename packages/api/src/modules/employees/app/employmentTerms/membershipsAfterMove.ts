import type { Tx } from "../../../../core/db";
import type { CalendarDate } from "../../../../utils";
import { employmentRepository, termsRepository } from "../../db";
import { planTermsMove, type TermsMembership } from "../../domain";

/** A move to look at before saving it: the terms and the date asked. */
export interface TermsMovePreview {
  termsId: string;
  startDate: CalendarDate;
}

/**
 * Each employee's terms over time, by id; with `move`, as they would be after it, for the people
 * it would move.
 */
export async function readMemberships(
  tx: Tx,
  employeeIds: readonly string[],
  move?: TermsMovePreview,
): Promise<Map<string, TermsMembership[]>> {
  const memberships = await termsRepository(tx).findMemberships(employeeIds);
  if (!move) {
    return memberships;
  }
  const employments = await employmentRepository(tx).findPeriods(employeeIds);
  return new Map(
    employeeIds.map((id) => {
      const plan = planTermsMove(
        { memberships: memberships.get(id) ?? [], employments: employments.get(id) ?? [] },
        move.termsId,
        move.startDate,
      );
      return [id, plan.kind === "move" ? plan.memberships : (memberships.get(id) ?? [])];
    }),
  );
}
