import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { DomainEvents } from "../../../core/events";
import { PrincipalSecurityContext } from "../../../core/security";
import { timeOffRequestRepository } from "../db";
import { type BookingRefusal, dayLabel, refusalOfBounds, refusalOfDates } from "../domain";
import { appendStatusChange, begin, type BookingDependencies, windowOf } from "./bookingSteps";

/** Records how the approval of requested time off ended; nothing for time off no longer waiting. */
export async function finishApproval(
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
  tx.publish("timeOff.request_decided", {
    timeOffId: stored.id,
    employeeId: stored.employeeId,
    runId: finished.runId,
    status,
  });
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
    const [employee] = await dependencies.employeeReads.readEmployeesByName(tx, [
      stored.employeeId,
    ]);
    throw new ApplicationError(
      "INVALID_INPUT",
      `${whyNotApprovable(refusal, employee?.firstName ?? "They")}, so this can't be approved. Reject it instead.`,
      [{ field: "dates", code: refusal.reason }],
    );
  }
}

const SYSTEM = PrincipalSecurityContext.system();

/** Why a request's days no longer fit, for its approver. */
function whyNotApprovable(refusal: BookingRefusal, firstName: string): string {
  const day = refusal.date && dayLabel(refusal.date);
  switch (refusal.reason) {
    case "outside_employment":
      return `${firstName} isn't employed on ${day}`;
    case "type_not_offered":
      return `This type isn't offered to ${firstName} on ${day}`;
    default:
      return "It's in a leave year that has closed";
  }
}
