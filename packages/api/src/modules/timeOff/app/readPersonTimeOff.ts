import type { Transact } from "../../../core/db";
import { isInRecordScope, type SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid } from "../../../utils";
import { type PersonVersion, personVersionsFrom } from "../../employees";
import { timeOffPolicyRepository } from "../db";
import type { PolicyVersion, TimeOffType } from "../domain";
import { type AllowanceEngineDependencies, readPeople } from "./allowanceEngine";
import { byTypeOrder } from "./readTimeOffTypes";

/** One company time off type, with a person's rules for it from today on. */
export interface PersonTimeOff {
  timeOffType: TimeOffType;
  /** Today's rules first, if any, then later changes; empty: not offered to the person. */
  versions: PersonVersion<PolicyVersion>[];
}

type Dependencies = Pick<AllowanceEngineDependencies, "employeeReads" | "today"> & {
  transact: Transact;
};

/**
 * Each in-scope person's rules for every company time off type, in list order, marked as their
 * terms' or their own, by id; ids the caller may not read are left out.
 */
export async function readPersonTimeOff(
  { transact, employeeReads, today }: Dependencies,
  ctx: SecurityContext,
  input: { employeeIds: readonly string[] },
): Promise<Map<string, PersonTimeOff[]>> {
  const scope = await ctx.recordScope("time_off", "read");
  const ids = [...new Set(input.employeeIds.map(parseUuid))].filter(
    (id): id is string => id !== null && isInRecordScope(scope, id),
  );
  if (ids.length === 0) return new Map();
  return transact(async (tx) => {
    const types = (await timeOffPolicyRepository(tx).findAllTypes()).sort(byTypeOrder);
    const { people, policies } = await readPeople(employeeReads, tx, ids);
    const termsPolicyIds = new Set(policies.filter((p) => p.termsId).map(({ id }) => id));
    const date: CalendarDate = today();
    return new Map(
      people.map((person) => [
        person.employeeId,
        types.map((timeOffType) => ({
          timeOffType,
          versions: personVersionsFrom(person.timelineOf(timeOffType.id), date, (policyId) =>
            termsPolicyIds.has(policyId),
          ),
        })),
      ]),
    );
  });
}
