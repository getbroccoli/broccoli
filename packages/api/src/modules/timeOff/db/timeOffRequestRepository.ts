import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { anyOf, type Orm, ormOf, type Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import type { DayPart } from "../domain";
import type { Booking, TimeOffStatus } from "./timeOffRepository";
import { DAY_COLUMNS, groupDays, TIME_OFF_COLUMNS } from "./timeOffRows";
import { timeOff } from "./timeOffTable";
import { timeOffDays } from "./timeOffDaysTable";

/** Requested time off as its list shows it: when it was asked for and how it was decided. */
export interface TimeOffRequest extends Booking {
  requestedAt: Date;
  /** Null while it waits, and when it ended without a decision. */
  decision: RequestDecision | null;
}

/** Who decided a request, when, and their comment. */
export interface RequestDecision {
  decidedAt: Date;
  /** Null once that employee is deleted. */
  decidedByEmployeeId: string | null;
  comment: string | null;
}

/** Time off without its days, with how its request was decided. */
export interface StoredTimeOff {
  id: string;
  employeeId: string;
  timeOffTypeId: string;
  status: TimeOffStatus;
  decision: RequestDecision | null;
}

/** How requested time off ended: approved or rejected by someone, or cancelled without a decision. */
export interface Decision {
  status: "approved" | "rejected" | "cancelled";
  decidedByEmployeeId: string | null;
  comment: string | null;
}

/** Requested time off and its decision. */
export interface TimeOffRequestRepository {
  /**
   * The people's requested time off, whatever its status now, with a day on or after `from`,
   * newest request first.
   */
  findRequests(input: {
    employeeIds: readonly string[];
    from: CalendarDate;
  }): Promise<TimeOffRequest[]>;
  /** Time off by id, without its days. */
  findByIds(ids: readonly string[]): Promise<StoredTimeOff[]>;
  /** The time off's days that are not cancelled, oldest first. */
  findDaysOf(id: string): Promise<{ date: CalendarDate; dayPart: DayPart }[]>;
  /** Marks the person's requested time off approved; only a preview does, rolling it back. */
  approveRequested(employeeId: string): Promise<void>;
  /** Records the decision on requested time off: its new status, who decided, when, and their comment. */
  decide(id: string, decision: Decision): Promise<void>;
}

export function timeOffRequestRepository(db: Orm | Tx): TimeOffRequestRepository {
  return {
    async findRequests({ employeeIds, from }) {
      const inRange = ormOf(db)
        .select({ id: timeOffDays.timeOffId })
        .from(timeOffDays)
        .where(gte(timeOffDays.date, from));
      const rows = await ormOf(db)
        .select({
          timeOff: { ...TIME_OFF_COLUMNS, requestedAt: timeOff.requestedAt, ...DECISION },
          day: DAY_COLUMNS,
        })
        .from(timeOff)
        .innerJoin(timeOffDays, eq(timeOffDays.timeOffId, timeOff.id))
        .where(
          and(
            anyOf(timeOff.employeeId, employeeIds),
            isNotNull(timeOff.requestedAt),
            inArray(timeOff.id, inRange),
          ),
        )
        .orderBy(desc(timeOff.requestedAt), desc(timeOff.id), asc(timeOffDays.date));
      return groupDays(rows).map(({ decidedAt, decidedByEmployeeId, decisionComment, ...row }) => ({
        ...row,
        requestedAt: row.requestedAt!,
        decision: decisionOf({ decidedAt, decidedByEmployeeId, decisionComment }),
      }));
    },
    async findByIds(ids) {
      const rows = await ormOf(db)
        .select({
          id: timeOff.id,
          employeeId: timeOff.employeeId,
          timeOffTypeId: timeOff.timeOffTypeId,
          status: timeOff.status,
          ...DECISION,
        })
        .from(timeOff)
        .where(anyOf(timeOff.id, ids));
      return rows.map(({ decidedAt, decidedByEmployeeId, decisionComment, ...row }) => ({
        ...row,
        decision: decisionOf({ decidedAt, decidedByEmployeeId, decisionComment }),
      }));
    },
    async findDaysOf(id) {
      return ormOf(db)
        .select(DAY_COLUMNS)
        .from(timeOffDays)
        .where(and(eq(timeOffDays.timeOffId, id), isNull(timeOffDays.cancelledAt)))
        .orderBy(asc(timeOffDays.date));
    },
    async approveRequested(employeeId) {
      await ormOf(db)
        .update(timeOff)
        .set({ status: "approved" })
        .where(and(eq(timeOff.employeeId, employeeId), eq(timeOff.status, "requested")));
    },
    async decide(id, { status, decidedByEmployeeId, comment }) {
      await ormOf(db)
        .update(timeOff)
        .set({
          status,
          decidedAt: status === "cancelled" ? null : sql`now()`,
          decidedByEmployeeId,
          decisionComment: comment,
        })
        .where(eq(timeOff.id, id));
    },
  };
}

/** The columns of a request's decision. */
const DECISION = {
  decidedAt: timeOff.decidedAt,
  decidedByEmployeeId: timeOff.decidedByEmployeeId,
  decisionComment: timeOff.decisionComment,
};

/** The decision a request's row holds, or null while it waits or when it ended without one. */
function decisionOf(row: {
  decidedAt: Date | null;
  decidedByEmployeeId: string | null;
  decisionComment: string | null;
}): RequestDecision | null {
  return row.decidedAt
    ? {
        decidedAt: row.decidedAt,
        decidedByEmployeeId: row.decidedByEmployeeId,
        comment: row.decisionComment,
      }
    : null;
}
