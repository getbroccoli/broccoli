import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import type { EmployeeReadService } from "../../employees";
import { timeOffRepository } from "../db";
import { datesLabel, type TimeOffType } from "../domain";
import { readPeople } from "./allowanceEngine";

/**
 * Notes which booked days of the type from `from` have rules now; the returned check refuses, with
 * CONFLICT naming the type and the days, once any of them has none.
 */
export async function watchBookedTimeOff(
  employeeReads: EmployeeReadService,
  tx: Tx,
  input: {
    employeeIds: string[];
    timeOffType: Pick<TimeOffType, "id" | "name">;
    from: CalendarDate;
  },
): Promise<() => Promise<void>> {
  const { employeeIds, timeOffType, from } = input;
  const booked = await timeOffRepository(tx).findDaysFrom({
    employeeIds,
    timeOffTypeId: timeOffType.id,
    from,
  });
  const ids = [...new Set(booked.map(({ employeeId }) => employeeId))];
  const coveredDays = async () => {
    const { people } = await readPeople(employeeReads, tx, ids);
    const timelines = new Map(
      people.map((person) => [person.employeeId, person.timelineOf(timeOffType.id)]),
    );
    return booked.map(
      ({ employeeId, date }) => timelines.get(employeeId)!.getVersionOnDate(date) !== null,
    );
  };
  const before = ids.length > 0 ? await coveredDays() : [];
  return async () => {
    if (ids.length === 0) return;
    const after = await coveredDays();
    const lost = booked.filter((_day, i) => before[i] && !after[i]);
    if (lost.length > 0) {
      throw new ApplicationError("CONFLICT", lostBookingsMessage(timeOffType.name, lost));
    }
  };
}

/** "Annual leave is booked on 4–8 Jan.", or "… is booked by 2 people on …" for several people. */
function lostBookingsMessage(
  typeName: string,
  lost: readonly { employeeId: string; date: CalendarDate }[],
): string {
  const people = new Set(lost.map(({ employeeId }) => employeeId)).size;
  const by = people === 1 ? "" : ` by ${people} people`;
  return `${typeName} is booked${by} on ${datesLabel(lost.map(({ date }) => date))}.`;
}
