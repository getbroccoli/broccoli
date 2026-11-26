import type { Transact } from "../../../core/db";
import { isInRecordScope, type SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid } from "../../../utils";
import { type StoredTimeOff, type TimeOffRequest, timeOffRequestRepository } from "../db";
import { type AllowanceEngineDependencies, readPeople } from "./allowanceEngine";
import { windowOf } from "./bookingSteps";

type Dependencies = Pick<AllowanceEngineDependencies, "employeeReads" | "today"> & {
  transact: Transact;
};

/**
 * Each readable person's requests, whatever their status now, with a day in the current leave
 * year of their type or later, newest first, by person; people the caller may not read are left out.
 */
export async function readRequests(
  { transact, employeeReads, today }: Dependencies,
  ctx: SecurityContext,
  employeeIds: readonly string[],
): Promise<Map<string, TimeOffRequest[]>> {
  const ids = await readableIds(ctx, employeeIds);
  if (ids.length === 0) return new Map();
  return transact(async (tx) => {
    const { people } = await readPeople(employeeReads, tx, ids);
    // A leave year starts at most a year before today; each type's own start filters further.
    const from = `${Number(today().slice(0, 4)) - 1}-01-01` as CalendarDate;
    const requests = await timeOffRequestRepository(tx).findRequests({ employeeIds: ids, from });
    const byPerson = Map.groupBy(requests, ({ employeeId }) => employeeId);
    return new Map(
      people.map((person) => [
        person.employeeId,
        (byPerson.get(person.employeeId) ?? []).filter(
          ({ timeOffTypeId, days }) =>
            days.at(-1)!.date >= windowOf(person, timeOffTypeId, today()).start,
        ),
      ]),
    );
  });
}

/** Where each time off stands and how it was decided, by id; time off the caller may not read is left out. */
export async function readStatuses(
  { transact }: Pick<Dependencies, "transact">,
  ctx: SecurityContext,
  timeOffIds: readonly string[],
): Promise<Map<string, StoredTimeOff>> {
  const ids = timeOffIds.flatMap((id) => parseUuid(id) ?? []);
  const scope = await ctx.recordScope("time_off", "read");
  const found = await transact((tx) => timeOffRequestRepository(tx).findByIds(ids));
  return new Map(
    found
      .filter(({ employeeId }) => isInRecordScope(scope, employeeId))
      .map((row) => [row.id, row]),
  );
}

async function readableIds(ctx: SecurityContext, employeeIds: readonly string[]) {
  const scope = await ctx.recordScope("time_off", "read");
  return [...new Set(employeeIds.flatMap((id) => parseUuid(id) ?? []))].filter((id) =>
    isInRecordScope(scope, id),
  );
}
