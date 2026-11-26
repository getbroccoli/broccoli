import { ApplicationError, invalidInput } from "../../../core/applicationError";
import { createApprovalService, MANAGER_APPROVAL } from "../../../core/approvals";
import type { BeforeCommitHandler, Orm, Transact, Tx } from "../../../core/db";
import type { DomainEvents } from "../../../core/events";
import type { Logger } from "../../../core/logger";
import {
  createRecordHistoryReaderService,
  createWriteModeService,
  type HistoryLine,
} from "../../../core/records";
import type { Connection } from "../../../core/pagination";
import { timeOffRecordType } from "./timeOffRecordType";
import { PrincipalSecurityContext, type SecurityContext } from "../../../core/security";
import { type CalendarDate, todayInLondon } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import {
  type StoredTimeOff,
  timeOffPolicyRepository,
  type TimeOffRequest,
  timeOffRequestRepository,
} from "../db";
import { readRequests, readStatuses } from "./readTimeOffRequests";
import { dateRangeLabel, dayLabel, refusalOfBounds, refusalOfDates, totalCost } from "../domain";
import {
  type BalanceChange,
  type BookedTimeOff,
  type BookingInput,
  type BookTimeOffService,
  createBookTimeOffService,
} from "./bookTimeOffService";
import {
  appendStatusChange,
  begin,
  type BookingDependencies,
  bookingDependencies,
  checkBooking,
  saveTimeOff,
  windowOf,
} from "./bookingSteps";
import { type ParsedBooking, parseBooking } from "./parseBooking";
import type { TimeOffService } from "./timeOffService";

/** Asking for one's own time off with approval, and recording how the approval ended. */
export interface TimeOffRequestService {
  /**
   * Saves the caller's own time off as requested, holding its days without touching the balance,
   * and asks the manager approval for it in the same transaction. Refuses anyone who may book it
   * straight away or may not ask for it, and a type that needs no approval.
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
  /** Where each readable time off stands and how it was decided, by id. */
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
  today = todayInLondon,
}: {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  bankHolidays: BankHolidayService;
  today?: () => CalendarDate;
}): TimeOffRequestService {
  const dependencies = bookingDependencies({ orm, transact, logger, timeOff, bankHolidays, today });
  const history = createRecordHistoryReaderService(orm, { time_off: timeOffRecordType(orm) });
  const preview = createBookTimeOffService({ orm, transact, logger, timeOff, bankHolidays, today });
  return {
    requestTimeOff: (ctx, input) => requestTimeOff(dependencies, preview, ctx, input),
    readRequests: (ctx, employeeIds) => readRequests(dependencies, ctx, employeeIds),
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
const approvals = createApprovalService();

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
  const saved = await dependencies
    .transact(async (tx) => {
      const person = await begin(dependencies, tx, booking);
      await requireApprovalType(tx, booking.timeOffTypeId);
      const { days, refusal } = await checkBooking(dependencies, tx, booking, person);
      if (refusal) {
        throw invalidInput([{ field: "dates", code: refusal.reason }]);
      }
      const result = await saveTimeOff(ctx, tx, booking, { days, status: "requested" });
      await approvals.requestApproval(ctx, tx, {
        approvalProcessKey: MANAGER_APPROVAL,
        record: { recordType: "time_off", recordId: result.id },
        requesterEmployeeId: booking.employeeId,
        ...(await approvalWords(dependencies, tx, { booking, booked: result.booked, balances })),
      });
      return result;
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
  const cost = totalCost(saved.booked);
  dependencies.logger.info(
    {
      timeOffId: saved.id,
      employeeId: booking.employeeId,
      timeOffTypeId: booking.timeOffTypeId,
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
    status: "requested",
    cost,
    note: booking.note,
    bookedAt: saved.createdAt,
  };
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

/** Refuses a type that is recorded without approval, such as Sickness. */
async function requireApprovalType(tx: Tx, timeOffTypeId: string): Promise<void> {
  const types = await timeOffPolicyRepository(tx).findAllTypes();
  if (!types.find(({ id }) => id === timeOffTypeId)?.needsApproval) {
    throw invalidInput([{ field: "timeOffTypeId", code: "needs_no_approval" }]);
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
              `${balances.length > 1 ? `${periodStart.slice(0, 4)}: ` : ""}${remainingBefore} free now, ${remainingAfter} after this.`,
            ],
      ),
      booking.note ? `${employee!.firstName}'s note: ${booking.note}` : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/** Records how the approval of requested time off ended; nothing for time off no longer waiting. */
async function finishApproval(
  dependencies: BookingDependencies,
  tx: Tx,
  finished: DomainEvents["approvals.approval_finished"],
): Promise<void> {
  const repository = timeOffRequestRepository(tx);
  const [stored] = await repository.findByIds([finished.recordId]);
  if (stored?.status !== "requested") {
    dependencies.logger.info(
      { timeOffId: finished.recordId, runId: finished.runId },
      "Approval finished for time off no longer waiting",
    );
    return;
  }
  const status = !finished.outcome
    ? "cancelled"
    : finished.outcome.code === "approved"
      ? "approved"
      : "rejected";
  if (status === "approved") {
    await requireStillBookable(dependencies, tx, stored);
  }
  const decision = {
    decidedByEmployeeId: finished.outcome?.byEmployeeId ?? null,
    comment: finished.outcome?.comment ?? null,
  };
  await repository.decide(stored.id, { status, ...decision });
  await appendStatusChange(SYSTEM, tx, {
    id: stored.id,
    from: "requested",
    to: status,
    cause: { kind: "PROCESS_RUN", ref: finished.runId },
    decision: finished.outcome ? decision : undefined,
  });
  if (status === "approved") {
    await dependencies.timeOff.ensureAllowances(SYSTEM, tx, {
      employeeIds: [stored.employeeId],
      cause: { kind: "TIME_OFF_APPROVED", ref: stored.id },
    });
  }
  dependencies.logger.info(
    { timeOffId: stored.id, employeeId: stored.employeeId, runId: finished.runId, status },
    "Finished time off approval",
  );
}

/**
 * Refuses approving time off whose days no longer fit: outside the person's employment, a type
 * no longer offered, or a day in a leave year that has closed. Clashes and the balance are not
 * checked again: waiting days already blocked clashes, and over the balance is allowed.
 */
async function requireStillBookable(
  dependencies: BookingDependencies,
  tx: Tx,
  stored: { id: string; employeeId: string; timeOffTypeId: string },
): Promise<void> {
  const person = await begin(dependencies, tx, stored);
  const days = await timeOffRequestRepository(tx).findDaysOf(stored.id);
  const window = windowOf(person, stored.timeOffTypeId, dependencies.today());
  const timeline = person.timelineOf(stored.timeOffTypeId);
  const range = { startDate: days[0]!.date, endDate: days.at(-1)!.date };
  const refusal =
    refusalOfBounds(range, window) ??
    refusalOfDates({
      ...range,
      employments: person.periods,
      isOfferedOn: (date) => timeline.getVersionOnDate(date) !== null,
    });
  if (refusal) {
    throw new ApplicationError(
      "INVALID_INPUT",
      "This time off can't be approved any more. Reject it instead.",
      [{ field: "dates", code: refusal.reason }],
    );
  }
}

const SYSTEM = PrincipalSecurityContext.system();
