import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { BeforeCommitHandler, Orm, Transact, Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import {
  createRecordHistoryReaderService,
  createWriteModeService,
  type HistoryLine,
} from "../../../core/records";
import type { Connection } from "../../../core/pagination";
import { timeOffRecordType } from "./timeOffRecordType";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, todayInLondon } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import {
  type StoredTimeOff,
  timeOffPolicyRepository,
  type TimeOffRequest,
  timeOffRequestRepository,
} from "../db";
import { finishApproval } from "./finishTimeOffApproval";
import { readCancellable } from "./cancelTimeOff";
import { readRequests, readStatuses } from "./readTimeOffRequests";
import { dateRangeLabel, dayLabel, totalCost } from "../domain";
import {
  type BalanceChange,
  type BookedTimeOff,
  type BookingInput,
  type BookTimeOffService,
  createBookTimeOffService,
} from "./bookTimeOffService";
import {
  approvalProcessOf,
  begin,
  type BookingDependencies,
  bookingDependencies,
  checkBooking,
  saveTimeOff,
} from "./bookingSteps";
import { type ParsedBooking, parseBooking } from "./parseBooking";
import type { TimeOffService } from "./timeOffService";

/** Asking for one's own time off with approval, and recording how the approval ended. */
export interface TimeOffRequestService {
  /**
   * Saves the caller's own time off as requested, holding its days without touching the balance,
   * and asks the type's approval process for it in the same transaction. Refuses anyone who may
   * book it straight away or may not ask for it, and a type booked straight away.
   */
  requestTimeOff: (ctx: SecurityContext, input: BookingInput) => Promise<BookedTimeOff>;
  /**
   * Before the commit of the change that decided an approval of time off: approves it (running the
   * allowance engine), rejects it, or cancels it when the approval ended without a decision.
   * Refusing an approval that no longer fits the booking rules rolls the decision back.
   */
  finishApprovals: BeforeCommitHandler;
  /** Each readable person's requests from their current leave year on, newest first, by person. */
  readRequests: (
    ctx: SecurityContext,
    employeeIds: readonly string[],
  ) => Promise<Map<string, TimeOffRequest[]>>;
  /** The ids among these the caller may cancel now. */
  readCancellable: (ctx: SecurityContext, timeOffIds: readonly string[]) => Promise<Set<string>>;
  /** Where each readable time off stands, how it was decided and who cancelled it, by id. */
  readStatuses: (
    ctx: SecurityContext,
    timeOffIds: readonly string[],
  ) => Promise<Map<string, StoredTimeOff>>;
  /** A time off's history, newest first, for who may read the person's time off. */
  readHistory: (
    ctx: SecurityContext,
    timeOffId: string,
    args: { first?: number; after?: string | null },
  ) => Promise<Connection<HistoryLine>>;
}

export function createTimeOffRequestService({
  orm,
  transact,
  logger,
  timeOff,
  bankHolidays,
  approvals,
  today = todayInLondon,
}: {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  bankHolidays: BankHolidayService;
  approvals: BookingDependencies["approvals"];
  today?: () => CalendarDate;
}): TimeOffRequestService {
  const services = { orm, transact, logger, timeOff, bankHolidays, approvals, today };
  const dependencies = bookingDependencies(services);
  const history = createRecordHistoryReaderService(orm, { time_off: timeOffRecordType(orm) });
  const preview = createBookTimeOffService(services);
  return {
    requestTimeOff: (ctx, input) => requestTimeOff(dependencies, preview, ctx, input),
    readRequests: (ctx, employeeIds) => readRequests(dependencies, ctx, employeeIds),
    readCancellable: (ctx, timeOffIds) => readCancellable(dependencies, ctx, timeOffIds),
    readStatuses: (ctx, timeOffIds) => readStatuses(dependencies, ctx, timeOffIds),
    readHistory: (ctx, timeOffId, args) => history.readHistory(ctx, "time_off", timeOffId, args),
    finishApprovals: async (tx, events) => {
      for (const event of events) {
        if (
          event.type === "approvals.approval_finished" &&
          event.payload.recordType === "time_off"
        ) {
          await finishApproval(dependencies, tx, event.payload);
        }
      }
    },
  };
}

const writeModes = createWriteModeService();

async function requestTimeOff(
  dependencies: BookingDependencies,
  preview: Pick<BookTimeOffService, "previewBooking">,
  ctx: SecurityContext,
  input: BookingInput,
): Promise<BookedTimeOff> {
  const booking = parseBooking(input);
  await requireRequest(ctx, booking.employeeId);
  // What the dialog showed, for the approver: free now and after this, per leave year.
  const { balances } = await preview.previewBooking(ctx, input);
  const saved = await saveRequest(dependencies, ctx, booking, balances);
  // An approval with nobody to decide ends before the commit, cancelling the request.
  const [committed] = await dependencies.transact((tx) =>
    timeOffRequestRepository(tx).findByIds([saved.id]),
  );
  if (!committed) {
    // The person was deleted just after asking, taking the request with them.
    throw new ApplicationError("NOT_FOUND", "No time off has this id.");
  }
  const cost = totalCost(saved.booked);
  dependencies.logger.info(
    {
      timeOffId: saved.id,
      employeeId: booking.employeeId,
      timeOffTypeId: booking.timeOffTypeId,
      approvalProcessKey: saved.approvalProcessKey,
      dayCount: saved.booked.length,
      cost,
    },
    "Requested time off",
  );
  return {
    id: saved.id,
    employeeId: booking.employeeId,
    timeOffTypeId: booking.timeOffTypeId,
    days: saved.booked.map(({ date, dayPart }) => ({ date, dayPart })),
    status: committed.status,
    cost,
    note: booking.note,
    bookedAt: saved.createdAt,
  };
}

/** The request and its approval in one transaction; a refused approval is logged as a setup fault. */
function saveRequest(
  dependencies: BookingDependencies,
  ctx: SecurityContext,
  booking: ParsedBooking,
  balances: readonly BalanceChange[],
) {
  return dependencies
    .transact(async (tx) => {
      const person = await begin(dependencies, tx, booking);
      const approvalProcessKey = await approvalProcessOf(tx, booking.timeOffTypeId);
      // A type booked straight away, such as Sickness, is never asked for.
      if (!approvalProcessKey) {
        throw invalidInput([{ field: "timeOffTypeId", code: "needs_no_approval" }]);
      }
      const { days, refusal } = await checkBooking(dependencies, tx, booking, person);
      if (refusal) {
        throw invalidInput([{ field: "dates", code: refusal.reason }]);
      }
      const result = await saveTimeOff(ctx, tx, booking, { days, status: "requested" });
      await dependencies.approvals.requestApproval(ctx, tx, {
        approvalProcessKey,
        record: { recordType: "time_off", recordId: result.id },
        requesterEmployeeId: booking.employeeId,
        ...(await approvalWords(dependencies, tx, { booking, booked: result.booked, balances })),
      });
      return { ...result, approvalProcessKey };
    })
    .catch((error: unknown) => {
      // Only the approval refuses with a conflict here: its process is off, a setup fault to look at.
      if (error instanceof ApplicationError && error.code === "CONFLICT") {
        dependencies.logger.warn(
          { employeeId: booking.employeeId, timeOffTypeId: booking.timeOffTypeId },
          "Requested time off could not start its approval",
        );
      }
      throw error;
    });
}

/** Only one's own time off is asked for: whoever books it straight away books it instead. */
async function requireRequest(ctx: SecurityContext, employeeId: string): Promise<void> {
  const mode = (await writeModes.writeModes(ctx, "time_off", "create", [employeeId])).get(
    employeeId,
  );
  if (mode === "refused") {
    throw new ApplicationError("FORBIDDEN", "You can only request your own time off.");
  }
  if (mode === "direct") {
    throw new ApplicationError("FORBIDDEN", "You can book this time off straight away.");
  }
}

/** The approver's task: who asks for which type and when, then the days, the cost and the note. */
async function approvalWords(
  { employeeReads }: BookingDependencies,
  tx: Tx,
  {
    booking,
    booked,
    balances,
  }: {
    booking: ParsedBooking;
    booked: readonly { date: CalendarDate; dayPart: string; cost: number }[];
    balances: readonly BalanceChange[];
  },
) {
  const [employee] = await employeeReads.readEmployeesByName(tx, [booking.employeeId]);
  const types = await timeOffPolicyRepository(tx).findAllTypes();
  const typeName = types.find(({ id }) => id === booking.timeOffTypeId)!.name;
  const first = booked[0]!.date;
  const last = booked.at(-1)!.date;
  const halfDays = booked
    .filter(({ dayPart }) => dayPart !== "full_day")
    .map(
      ({ date, dayPart }) =>
        `${dayPart === "morning" ? "morning" : "afternoon"} only on ${dayLabel(date)}`,
    );
  const cost = totalCost(booked);
  return {
    title: `Approve ${employee!.firstName}'s ${typeName}, ${dateRangeLabel(first, last)}`,
    description: [
      `${typeName}, ${cost} ${cost === 1 ? "day" : "days"}: ${dayLabel(first)} to ${dayLabel(last)} ${last.slice(0, 4)}${halfDays.length > 0 ? `, ${halfDays.join(", ")}` : ""}.`,
      ...balances.flatMap(({ periodStart, remainingBefore, remainingAfter }) =>
        remainingBefore === null
          ? []
          : [
              `${balances.length > 1 ? `${periodStart.slice(0, 4)}: ` : ""}When asked: ${remainingBefore} free, ${remainingAfter} after this.`,
            ],
      ),
      booking.note ? `${employee!.firstName}'s note: ${booking.note}` : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}
