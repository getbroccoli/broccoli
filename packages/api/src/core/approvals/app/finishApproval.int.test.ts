import {
  ADMIN,
  SYSTEM,
  approvalParticipants,
  approvalRequest,
  approvalToday,
  employeeServices,
  expect,
  processService,
  signedIn,
  taskService,
  test,
  transactWithApprovals,
} from "#test/support";

import type { Orm } from "../../db";
import type { DomainEvents } from "../../events";
import { MANAGER_APPROVAL } from "../domain";
import { createApprovalService } from "./approvalService";

test("rejecting an approval delivers the outcome and decider to the feature before commit", async ({
  orm,
  seed,
}) => {
  const { sam, mia, requester, manager } = await approvalParticipants(orm, seed);
  const { transact, finished } = observeApprovals(orm);
  await transact((tx) =>
    createApprovalService().requestApproval(requester, tx, approvalRequest(sam.id)),
  );
  const tasks = taskService(orm, { transact });
  const {
    needsYou: [task],
  } = await tasks.listMyTasks(manager);
  const [run] = await processService(orm).listRuns(ADMIN, MANAGER_APPROVAL);

  await tasks.markDone(manager, task!.id, { result: rejection });

  expect(finished).toEqual([
    {
      approvalProcessKey: MANAGER_APPROVAL,
      recordType: "employee",
      recordId: sam.id,
      runId: run!.id,
      outcome: { ...rejection, byEmployeeId: mia.id },
      endedWithoutOutcome: null,
    },
  ]);
});

test("rolls back the decision when the feature cannot finish the approval", async ({
  orm,
  seed,
}) => {
  const { sam, requester, manager } = await approvalParticipants(orm, seed);
  const transact = transactWithApprovals(orm, { today: approvalToday }, (_tx, events) => {
    if (events.some(({ type }) => type === "approvals.approval_finished")) {
      throw new Error("Cannot update the requested record");
    }
    return Promise.resolve();
  });
  await transact((tx) =>
    createApprovalService().requestApproval(requester, tx, approvalRequest(sam.id)),
  );
  const tasks = taskService(orm, { transact });
  const {
    needsYou: [task],
  } = await tasks.listMyTasks(manager);

  await expect(tasks.markDone(manager, task!.id, { result: rejection })).rejects.toThrow(
    "Cannot update the requested record",
  );

  expect(await tasks.readTask(manager, task!.id)).toMatchObject({ status: "to_do", result: null });
});

test("finishes the approval immediately when nobody can approve", async ({ orm, seed }) => {
  await seed.owner();
  const sam = await seed.employee();
  const requester = signedIn(orm, { employeeId: sam.id, profiles: ["EMPLOYEE"] });
  const { transact, finished } = observeApprovals(orm);

  await transact((tx) =>
    createApprovalService().requestApproval(requester, tx, approvalRequest(sam.id)),
  );

  const [run] = await processService(orm).listRuns(ADMIN, MANAGER_APPROVAL);
  expect(finished).toMatchObject([
    { recordId: sam.id, runId: run!.id, outcome: null, endedWithoutOutcome: "no_approver" },
  ]);
});

test("finishes the approval without an outcome when the daily pass cancels its run", async ({
  orm,
  seed,
}) => {
  const { sam, mia, requester } = await approvalParticipants(orm, seed);
  const { transact, finished } = observeApprovals(orm);
  await transact((tx) =>
    createApprovalService().requestApproval(requester, tx, approvalRequest(sam.id)),
  );
  const processes = processService(orm, { today: approvalToday, transact });
  const [run] = await processes.listRuns(ADMIN, MANAGER_APPROVAL);
  await employeeServices(orm).deleteEmployee(ADMIN, { id: mia.id });

  await processes.startDueRuns(SYSTEM, approvalToday());

  expect(finished).toMatchObject([
    { recordId: sam.id, runId: run!.id, outcome: null, endedWithoutOutcome: "run_cancelled" },
  ]);
});

function observeApprovals(orm: Orm) {
  const finished: DomainEvents["approvals.approval_finished"][] = [];
  const transact = transactWithApprovals(orm, { today: approvalToday }, (_tx, events) => {
    for (const event of events) {
      if (event.type === "approvals.approval_finished") finished.push(event.payload);
    }
    return Promise.resolve();
  });
  return { transact, finished };
}

const rejection = { code: "rejected", comment: "Clashes with the release week." };
