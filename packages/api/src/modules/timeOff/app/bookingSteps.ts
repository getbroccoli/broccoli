import { ApplicationError } from "../../../core/applicationError";
import type { ApprovalProcessKey, ApprovalService } from "../../../core/approvals";
import type { Orm, Transact, Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import { createRecordHistoryService, type FieldChange } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import type { CalendarDate } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import {
  createEmployeeReadService,
  createEmployeeWorkingPatternService,
  type EmployeeReadService,
  type EmployeeWorkingPatternService,
} from "../../employees";
import { timeOffPolicyRepository, timeOffRepository, type TimeOffStatus } from "../db";
import { bookingWindow, type CostedDay, totalCost } from "../domain";
import { type Person, readPeople } from "./allowanceEngine";
import { checkDays } from "./checkDays";
import type { ParsedBooking } from "./parseBooking";
import type { TimeOffService } from "./timeOffService";

/** What booking and requesting time off read and lock. */
export interface BookingDependencies {
  transact: Transact;
  logger: Logger;
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  employeeReads: Pick<
    EmployeeReadService,
    | "holdEmployeeWrites"
    | "lockEmployees"
    | "readEmploymentPeriods"
    | "readTermsMemberships"
    | "readEmployeesByName"
  >;
  workingWeeks: Pick<EmployeeWorkingPatternService, "readWorkingWeeksInTransaction">;
  bankHolidays: BankHolidayService;
  /** Asks for approval of a request, and withdraws it when the request is cancelled. */
  approvals: Pick<ApprovalService, "requestApproval" | "cancelApproval">;
  today: () => CalendarDate;
}

/** The dependencies of booking and requesting, from a module's. */
export function bookingDependencies({
  orm,
  transact,
  today,
  ...dependencies
}: Omit<BookingDependencies, "employeeReads" | "workingWeeks"> & {
  orm: Orm;
}): BookingDependencies {
  return {
    ...dependencies,
    transact,
    today,
    employeeReads: createEmployeeReadService({ orm }),
    workingWeeks: createEmployeeWorkingPatternService({ transact, today }),
  };
}

/** Locks the person and checks the type exists; refuses an unknown person or type. */
export async function begin(
  dependencies: BookingDependencies,
  tx: Tx,
  booking: Pick<ParsedBooking, "employeeId" | "timeOffTypeId">,
): Promise<Person> {
  if (!(await lockPerson(dependencies, tx, booking.employeeId))) {
    throw new ApplicationError("NOT_FOUND", "No employee has this id.");
  }
  const types = await timeOffPolicyRepository(tx).findAllTypes();
  if (!types.some(({ id }) => id === booking.timeOffTypeId)) {
    throw new ApplicationError("NOT_FOUND", "No time off type has this id.");
  }
  const { people } = await readPeople(dependencies.employeeReads, tx, [booking.employeeId]);
  return people[0]!;
}

/**
 * The booking's days and the first refusal, in its window; refuses a cost other than the one the
 * person was shown, as their days were costed again since.
 */
export async function checkBooking(
  dependencies: BookingDependencies,
  tx: Tx,
  booking: ParsedBooking,
  person: Person,
) {
  const window = windowOf(person, booking.timeOffTypeId, dependencies.today());
  const checked = await checkDays(dependencies, tx, { booking, person, window });
  const cost = totalCost(checked.days);
  if (!checked.refusal && booking.expectedDays !== null && cost !== booking.expectedDays) {
    throw new ApplicationError(
      "CONFLICT",
      `This is ${cost} days now, not ${booking.expectedDays}. Show the person the new preview first.`,
    );
  }
  return checked;
}

/** The days a person may book or ask for of a type, from today's leave year on. */
export function windowOf(person: Person, timeOffTypeId: string, today: CalendarDate) {
  return bookingWindow({
    leaveYear: person.timelineOf(timeOffTypeId).getVersionOnDate(today)?.leaveYear,
    serviceStart: person.serviceStart,
    today,
  });
}

/**
 * Who approves one's own time off of the type, read in the saving transaction so a later change
 * never reaches it: an approval process, null when it is booked straight away, undefined when no
 * type has this id.
 */
export async function approvalProcessOf(
  tx: Tx,
  timeOffTypeId: string,
): Promise<ApprovalProcessKey | null | undefined> {
  const types = await timeOffPolicyRepository(tx).findAllTypes();
  return types.find(({ id }) => id === timeOffTypeId)?.approvalProcessKey;
}

/** Saves time off with the days that cost something, and its history line; returns them. */
export async function saveTimeOff(
  ctx: SecurityContext,
  tx: Tx,
  booking: ParsedBooking,
  { days, status }: { days: CostedDay[]; status: "approved" | "requested" },
) {
  const booked = days.filter(({ cost }) => cost > 0);
  const saved = await timeOffRepository(tx).insertTimeOff({
    employeeId: booking.employeeId,
    timeOffTypeId: booking.timeOffTypeId,
    status,
    note: booking.note,
    createdByUserId: ctx.user?.userId ?? null,
    days: booked.map(({ date, dayPart }) => ({ date, dayPart })),
  });
  await recordHistory.append(ctx, tx, {
    recordType: "time_off",
    operation: "CREATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [
      {
        recordId: saved.id,
        changes: [
          change("status", null, status),
          change("timeOffTypeId", null, booking.timeOffTypeId),
          change("startDate", null, booked[0]?.date ?? null),
          change("endDate", null, booked.at(-1)?.date ?? null),
          change("note", null, booking.note),
        ],
      },
    ],
  });
  return { ...saved, booked };
}

/** Appends the line of a time off's new status, with the decision's fields when there are any. */
export async function appendStatusChange(
  ctx: SecurityContext,
  tx: Tx,
  input: {
    id: string;
    from: TimeOffStatus;
    to: TimeOffStatus;
    cause: { kind: "EDITED_DIRECTLY" } | { kind: "PROCESS_RUN"; ref: string };
    decision?: { decidedByEmployeeId: string | null; comment: string | null };
    /** Who cancelled it, when it is cancelled by someone. */
    cancelledByEmployeeId?: string | null;
  },
): Promise<void> {
  const { decision, cancelledByEmployeeId } = input;
  await recordHistory.append(ctx, tx, {
    recordType: "time_off",
    operation: "UPDATED",
    cause: input.cause,
    records: [
      {
        recordId: input.id,
        changes: [
          change("status", input.from, input.to),
          ...(decision
            ? [
                change("decidedByEmployeeId", null, decision.decidedByEmployeeId),
                change("decisionComment", null, decision.comment),
              ]
            : []),
          ...(cancelledByEmployeeId
            ? [change("cancelledByEmployeeId", null, cancelledByEmployeeId)]
            : []),
        ],
      },
    ],
  });
}

const recordHistory = createRecordHistoryService();

function change(field: string, oldValue: string | null, newValue: string | null): FieldChange {
  return { field, oldValue, newValue };
}

/**
 * Locks what a booking reads in the order everyone takes it: employee writes, then policies, then
 * working patterns (as publishing terms takes them before the person's row), then the person. False
 * when the person is gone.
 */
export async function lockPerson(
  { employeeReads, workingWeeks, today }: BookingDependencies,
  tx: Tx,
  employeeId: string,
  /** Other people to lock with them, in one id-ordered lock, such as who cancels their time off. */
  others: readonly string[] = [],
): Promise<boolean> {
  // Deleting a person takes it before their row, and their row before the working patterns.
  await employeeReads.holdEmployeeWrites(tx);
  await timeOffPolicyRepository(tx).sharePolicies();
  // A one-day read only to take the working patterns' read lock before the person's.
  await workingWeeks.readWorkingWeeksInTransaction(tx, {
    employeeIds: [employeeId],
    from: today(),
    until: today(),
  });
  const locked = await employeeReads.lockEmployees(tx, [employeeId, ...others]);
  return locked.includes(employeeId);
}
