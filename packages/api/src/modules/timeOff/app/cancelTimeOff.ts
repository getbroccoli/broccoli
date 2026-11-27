import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import { isInRecordScope, type RecordScope, type SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import { type StoredTimeOff, timeOffRepository, timeOffRequestRepository } from "../db";
import { type CancelRefusal, cancelRefusal } from "../domain";
import { readPeople } from "./readPeople";
import { appendStatusChange, type BookingDependencies, lockPerson, windowOf } from "./bookingSteps";

/**
 * Cancels time off: a waiting request, withdrawing it from its approval, or approved time off,
 * giving its days back. The person withdraws their own request, and cancels their own approved
 * time off before it starts; admins cancel anyone's.
 */
export async function cancelTimeOff(
  dependencies: BookingDependencies,
  ctx: SecurityContext,
  input: { timeOffId: string },
): Promise<void> {
  const timeOffId = parseUuid(input.timeOffId);
  const result = await dependencies.transact(async (tx) => {
    const [read] = timeOffId ? await timeOffRequestRepository(tx).findByIds([timeOffId]) : [];
    if (!read) throw new ApplicationError("NOT_FOUND", NO_TIME_OFF);
    await ctx.requireInScope("time_off", "delete", read.employeeId);
    const deleteScope = await ctx.recordScope("time_off", "delete");
    requireCancellable(ctx, deleteScope, read, dependencies.today());
    // Deleting the person takes this guard before their tasks, so it comes before the approval's.
    await dependencies.employeeReads.holdEmployeeWrites(tx);
    const canceller = await readCanceller(dependencies, ctx, tx);
    // The approval's task and run next, as approving takes them before the person.
    const approvalRunId =
      read.status === "requested"
        ? await withdrawApproval(dependencies, ctx, tx, { read, canceller })
        : null;
    await lockStillAsRead(dependencies, ctx, tx, { read, deleteScope });
    await timeOffRepository(tx).cancel(read.id, ctx.user?.employeeId ?? null);
    await appendStatusChange(ctx, tx, {
      id: read.id,
      from: read.status,
      to: "cancelled",
      cause: { kind: "EDITED_DIRECTLY" },
      cancelledByEmployeeId: ctx.user?.employeeId ?? null,
    });
    const ensured =
      read.status === "approved"
        ? await dependencies.timeOff.ensureAllowances(ctx, tx, {
            employeeIds: [read.employeeId],
            cause: { kind: "TIME_OFF_CANCELLED", ref: read.id },
          })
        : null;
    return { read, approvalRunId, ensured };
  });
  logCancelled(dependencies, ctx, result);
}

/** The ids among these the caller may cancel now. */
export async function readCancellable(
  {
    transact,
    today,
    employeeReads,
  }: Pick<BookingDependencies, "transact" | "today" | "employeeReads">,
  ctx: SecurityContext,
  timeOffIds: readonly string[],
): Promise<Set<string>> {
  const ids = timeOffIds.flatMap((id) => parseUuid(id) ?? []);
  const deleteScope = await ctx.recordScope("time_off", "delete");
  if (ids.length === 0 || deleteScope === "none") return new Set();
  const readScope = await ctx.recordScope("time_off", "read");
  return transact(async (tx) => {
    const allowed = (await timeOffRequestRepository(tx).findByIds(ids)).filter(
      (stored) =>
        isInRecordScope(deleteScope, stored.employeeId) &&
        isInRecordScope(readScope, stored.employeeId) &&
        !cancelRefusalFor(ctx, deleteScope, stored, { today: today() }),
    );
    const closed = await inClosedLeaveYears(employeeReads, tx, allowed, today());
    return new Set(allowed.filter(({ id }) => !closed.has(id)).map(({ id }) => id));
  });
}

/** After commit: what was cancelled, by whom, and a request that had no approval left to end. */
function logCancelled(
  { logger }: BookingDependencies,
  ctx: SecurityContext,
  {
    read,
    approvalRunId,
    ensured,
  }: { read: StoredTimeOff; approvalRunId: string | null; ensured: object | null },
): void {
  if (read.status === "requested" && !approvalRunId) {
    logger.warn({ timeOffId: read.id }, "Cancelled time off without an approval in progress");
  }
  logger.info(
    {
      timeOffId: read.id,
      employeeId: read.employeeId,
      timeOffTypeId: read.timeOffTypeId,
      previousStatus: read.status,
      cancelledByPerson: ctx.user?.employeeId === read.employeeId,
      approvalRunId,
      ...ensured,
    },
    "Cancelled time off",
  );
}

/** Refuses what the caller may not cancel now, by the rule for them. */
function requireCancellable(
  ctx: SecurityContext,
  deleteScope: RecordScope,
  stored: StoredTimeOff,
  today: ReturnType<BookingDependencies["today"]>,
): void {
  const refusal = cancelRefusalFor(ctx, deleteScope, stored, { today });
  if (refusal) throw refusalError(refusal);
}

/**
 * The caller's employee, read under the employees' guard so it stays; refuses one deleted since
 * they signed in, whom the cancel could not name. Null for a caller without an employee.
 */
async function readCanceller({ employeeReads }: BookingDependencies, ctx: SecurityContext, tx: Tx) {
  const employeeId = ctx.user?.employeeId;
  if (!employeeId) return null;
  const [canceller] = await employeeReads.readEmployeesByName(tx, [employeeId]);
  if (!canceller) throw new ApplicationError("FORBIDDEN", "You are not allowed to do this.");
  return canceller;
}

/** The rule for this caller: the person's own rules on their own time off, unless their grant reaches everyone. */
function cancelRefusalFor(
  ctx: SecurityContext,
  deleteScope: RecordScope,
  stored: StoredTimeOff,
  { today }: { today: ReturnType<BookingDependencies["today"]> },
): CancelRefusal | null {
  return cancelRefusal({
    ownRules: stored.employeeId === ctx.user?.employeeId && deleteScope !== "all",
    bookedByCaller:
      stored.createdByEmployeeId !== null && stored.createdByEmployeeId === ctx.user?.employeeId,
    status: stored.status,
    firstDate: stored.firstDate,
    today,
  });
}

/** Ends the request's approval run and the approver's task, saying who withdrew it; its run's id. */
async function withdrawApproval(
  { approvals }: BookingDependencies,
  ctx: SecurityContext,
  tx: Tx,
  {
    read,
    canceller,
  }: { read: StoredTimeOff; canceller: Awaited<ReturnType<typeof readCanceller>> },
): Promise<string | null> {
  const reason = !canceller
    ? "This request was cancelled."
    : canceller.id === read.employeeId
      ? `${canceller.firstName} withdrew this request.`
      : `${canceller.firstName} ${canceller.lastName} cancelled this request.`;
  const ended = await approvals.cancelApproval(ctx, tx, {
    record: { recordType: "time_off", recordId: read.id },
    reason,
  });
  return ended?.runId ?? null;
}

/**
 * Locks the time off, after the person and whoever cancels for approved time off, and refuses
 * when it changed since it was read: decided or cancelled meanwhile, started while waiting, or in
 * a leave year that has closed, which is never recalculated, so its days could not go back.
 */
async function lockStillAsRead(
  dependencies: BookingDependencies,
  ctx: SecurityContext,
  tx: Tx,
  { read, deleteScope }: { read: StoredTimeOff; deleteScope: RecordScope },
): Promise<void> {
  // A request runs no engine, so the person's row stays unlocked: its approval run just took a key
  // share on the canceller's row, and upgrading it would deadlock with their other withdrawal.
  // Approved time off locks the person before it, as deleting the person takes it with its
  // cascade, and the canceller with them in one id-ordered lock, as storing them takes a key share.
  const canceller = ctx.user?.employeeId;
  const locked =
    read.status === "requested" ||
    (await lockPerson(dependencies, tx, read.employeeId, canceller ? [canceller] : []));
  const found = locked ? await timeOffRepository(tx).lockTimeOff(read.id) : null;
  if (!found) throw new ApplicationError("NOT_FOUND", NO_TIME_OFF);
  if (found.status !== read.status) {
    throw new ApplicationError(
      "CONFLICT",
      found.status === "cancelled" ? ALREADY_CANCELLED : DECIDED_MEANWHILE,
    );
  }
  // The day may have turned while it waited for the locks.
  requireCancellable(
    ctx,
    deleteScope,
    { ...read, firstDate: found.firstDate },
    dependencies.today(),
  );
  const closed = await inClosedLeaveYears(
    dependencies.employeeReads,
    tx,
    [read],
    dependencies.today(),
  );
  if (closed.size > 0) {
    throw new ApplicationError("CONFLICT", "This time off is in a leave year that has closed.");
  }
}

/** The approved ones among these whose first day is in a leave year that has closed, by id. */
async function inClosedLeaveYears(
  employeeReads: BookingDependencies["employeeReads"],
  tx: Tx,
  timeOffs: readonly StoredTimeOff[],
  today: ReturnType<BookingDependencies["today"]>,
): Promise<Set<string>> {
  // A leave year holding a day from today on hasn't closed, so only earlier days need its window.
  const approved = timeOffs.filter(
    ({ status, firstDate }) => status === "approved" && firstDate < today,
  );
  if (approved.length === 0) return new Set();
  const employeeIds = [...new Set(approved.map(({ employeeId }) => employeeId))];
  const { people } = await readPeople(employeeReads, tx, employeeIds);
  const personOf = new Map(people.map((person) => [person.employeeId, person]));
  return new Set(
    approved
      .filter(({ employeeId, timeOffTypeId, firstDate }) => {
        const person = personOf.get(employeeId);
        return person !== undefined && firstDate < windowOf(person, timeOffTypeId, today).start;
      })
      .map(({ id }) => id),
  );
}

function refusalError(refusal: CancelRefusal): ApplicationError {
  switch (refusal) {
    case "time_off_was_rejected":
      return new ApplicationError("CONFLICT", "This time off was rejected.");
    case "time_off_is_already_cancelled":
      return new ApplicationError("CONFLICT", ALREADY_CANCELLED);
    case "time_off_was_booked_by_someone_else":
      return new ApplicationError(
        "FORBIDDEN",
        "Only an admin can cancel time off someone else booked for you.",
      );
    case "time_off_has_started":
      return new ApplicationError(
        "CONFLICT",
        "This time off has started. Ask an admin to cancel it.",
      );
  }
}

const NO_TIME_OFF = "No time off has this id.";
const ALREADY_CANCELLED = "This time off is already cancelled.";
/** Why a cancel stops when an approver decided the request between the read and the locks. */
const DECIDED_MEANWHILE = "This request was decided meanwhile. Look again.";
