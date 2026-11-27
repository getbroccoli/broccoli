import { and, asc, isNull } from "drizzle-orm";

import { anyOf, type Orm, ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import { timeOffPolicyAssignments } from "./timeOffPolicyAssignmentsTable";

/** A person's row that stops offering them a type from a date to a date, over their terms. */
export interface OfferStop {
  id: string;
  employeeId: string;
  timeOffTypeId: string;
  startDate: CalendarDate;
  /** Null: open-ended. */
  endDate: CalendarDate | null;
}

/**
 * People's stops: assignment rows without a version, so they never overlap the person's rules for
 * the type. `timeOffPolicyRepository.deleteAssignment` deletes one.
 */
export interface OfferStopRepository {
  /** These employees' stops, oldest first. */
  findByEmployees(employeeIds: readonly string[]): Promise<OfferStop[]>;
  insert(stop: Omit<OfferStop, "id">): Promise<string>;
}

export function offerStopRepository(db: Orm | Tx): OfferStopRepository {
  return {
    async findByEmployees(employeeIds) {
      if (employeeIds.length === 0) {
        return [];
      }
      const rows = await ormOf(db)
        .select()
        .from(timeOffPolicyAssignments)
        .where(
          and(
            isNull(timeOffPolicyAssignments.timeOffPolicyVersionId),
            anyOf(timeOffPolicyAssignments.employeeId, employeeIds),
          ),
        )
        .orderBy(asc(timeOffPolicyAssignments.startDate));
      return rows.map(({ id, employeeId, timeOffTypeId, startDate, endDate }) => ({
        id,
        employeeId: employeeId!,
        timeOffTypeId,
        startDate,
        endDate,
      }));
    },

    async insert(stop) {
      const [inserted] = await ormOf(db)
        .insert(timeOffPolicyAssignments)
        .values(stop)
        .returning({ id: timeOffPolicyAssignments.id });
      return inserted!.id;
    },
  };
}
