import { MANAGER_APPROVAL, type ApprovalRequest } from "../../src/core/approvals";
import type { Orm } from "../../src/core/db";
import type { DomainEvents } from "../../src/core/events";
import { approvalService, processService, transactWithApprovals } from "./processService";
import { taskService } from "./services";
import { calendarDate } from "./calendarDate";
import { signedIn } from "./signedIn";
import type { TestSeed } from "./testSeed";

export const approvalToday = () => calendarDate("2026-12-01");

export function approvalRequest(requesterEmployeeId: string): ApprovalRequest {
  return {
    approvalProcessKey: MANAGER_APPROVAL,
    record: { recordType: "employee", recordId: requesterEmployeeId },
    requesterEmployeeId,
    title: "Approve Sam's leave, 2–4 Dec",
    description: "Annual leave, 2.5 days.",
  };
}

export async function approvalParticipants(orm: Orm, seed: TestSeed) {
  const sam = await seed.employee({ firstName: "Sam" });
  const mia = await seed.employee({ firstName: "Mia" });
  await seed.manager(sam.id, mia.id);
  return {
    sam,
    mia,
    requester: signedIn(orm, { employeeId: sam.id, profiles: ["EMPLOYEE"] }),
    manager: signedIn(orm, { employeeId: mia.id, profiles: ["EMPLOYEE"] }),
  };
}

/** Captures the approval outcomes delivered to a feature before commit. */
export function observeApprovals(orm: Orm) {
  const finished: DomainEvents["approvals.approval_finished"][] = [];
  const transact = transactWithApprovals(orm, { today: approvalToday }, (_tx, events) => {
    for (const event of events) {
      if (event.type === "approvals.approval_finished") finished.push(event.payload);
    }
    return Promise.resolve();
  });
  const processes = processService(orm, { today: approvalToday, transact });
  const approvals = approvalService(orm, { today: approvalToday, transact });
  return { approvals, processes, tasks: taskService(orm, { transact }), transact, finished };
}
