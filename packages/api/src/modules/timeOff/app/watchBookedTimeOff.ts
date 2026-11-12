import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import type { EmployeeReadService } from "../../employees";
import { timeOffRepository } from "../db";
import { readPeople } from "./allowanceEngine";

/**
 * Notes which booked days of the type from `from` have rules now; the returned check refuses, with
 * CONFLICT, once any of them has none.
 */
export async function watchBookedTimeOff(
  employeeReads: EmployeeReadService,
  tx: Tx,
  input: { employeeIds: string[]; timeOffTypeId: string; from: CalendarDate },
): Promise<() => Promise<void>> {
  const booked = await timeOffRepository(tx).findDaysFrom(input);
  const ids = [...new Set(booked.map(({ employeeId }) => employeeId))];
  const coveredDays = async () => {
    const { people } = await readPeople(employeeReads, tx, ids);
    const timelines = new Map(
      people.map((person) => [person.employeeId, person.timelineOf(input.timeOffTypeId)]),
    );
    return booked.map(
      ({ employeeId, date }) => timelines.get(employeeId)!.getVersionOnDate(date) !== null,
    );
  };
  const before = ids.length > 0 ? await coveredDays() : [];
  return async () => {
    if (ids.length === 0) return;
    const after = await coveredDays();
    const losing = new Set(
      booked.filter((_day, i) => before[i] && !after[i]).map(({ employeeId }) => employeeId),
    );
    if (losing.size > 0) {
      throw new ApplicationError(
        "CONFLICT",
        losing.size === 1
          ? "1 person has this time off type booked from that date."
          : `${losing.size} people have this time off type booked from that date.`,
      );
    }
  };
}
