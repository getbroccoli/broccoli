import { ApplicationError } from "../../../core/applicationError";
import type { BeforeCommitHandler, Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { CalendarDate } from "../../../utils";
import type { EmployeeReadService } from "../../employees";
import { timeOffPolicyRepository, timeOffRepository } from "../db";
import { datesLabel } from "../domain";
import { readPeople } from "./readPeople";

type Reads = Pick<
  EmployeeReadService,
  "readEmploymentPeriods" | "readTermsMemberships" | "readEmployeesByName"
>;

/**
 * Refuses, with CONFLICT before it commits, a terms change that leaves someone's approved or
 * pending time off from its date without rules; own rules that still cover a day keep it.
 */
export function refuseBookingsWithoutRules({
  employeeReads,
  logger,
}: {
  employeeReads: Reads;
  logger: Logger;
}): BeforeCommitHandler {
  return async (tx, events) => {
    for (const event of events) {
      if (event.type !== "employees.terms_changed") continue;
      const lost = await daysWithoutRules(employeeReads, tx, event.payload);
      if (lost.length > 0) {
        logger.info(
          {
            employeeIds: [...new Set(lost.map(({ employeeId }) => employeeId))],
            from: event.payload.from,
            lostDayCount: lost.length,
          },
          "Refused a terms change that leaves booked time off without rules",
        );
        throw new ApplicationError("CONFLICT", await lostDaysMessage(employeeReads, tx, lost));
      }
    }
  };
}

type BookedDay = { employeeId: string; timeOffTypeId: string; date: CalendarDate };

/** The people's booked days from `from` on that no rules cover, as their terms now stand. */
async function daysWithoutRules(
  employeeReads: Reads,
  tx: Tx,
  { employeeIds, from }: { employeeIds: string[]; from: CalendarDate },
): Promise<BookedDay[]> {
  const booked = await timeOffRepository(tx).findDaysFrom({ employeeIds, from });
  if (booked.length === 0) return [];
  const { people } = await readPeople(employeeReads, tx, [
    ...new Set(booked.map(({ employeeId }) => employeeId)),
  ]);
  const personOf = new Map(people.map((person) => [person.employeeId, person]));
  return booked.filter(
    ({ employeeId, timeOffTypeId, date }) =>
      personOf.get(employeeId)!.timelineOf(timeOffTypeId).getVersionOnDate(date) === null,
  );
}

/** "Aisha Begum has Annual leave booked on 4–8 Jan.", one sentence per person and type. */
async function lostDaysMessage(employeeReads: Reads, tx: Tx, lost: readonly BookedDay[]) {
  const people = await employeeReads.readEmployeesByName(tx, [
    ...new Set(lost.map(({ employeeId }) => employeeId)),
  ]);
  const types = new Map(
    (await timeOffPolicyRepository(tx).findAllTypes()).map(({ id, name }) => [id, name]),
  );
  return people
    .flatMap(({ id, firstName, lastName }) => {
      const byType = Map.groupBy(
        lost.filter(({ employeeId }) => employeeId === id),
        ({ timeOffTypeId }) => types.get(timeOffTypeId)!,
      );
      return [...byType]
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(
          ([type, days]) =>
            `${firstName} ${lastName} has ${type} booked on ${datesLabel(days.map(({ date }) => date))}.`,
        );
    })
    .join(" ");
}
