import {
  ADMIN,
  approvalParticipants,
  approvalRequest,
  approvalService,
  approvalToday,
  taskService,
  employeeServices,
  observeApprovals,
  transactWithApprovals,
  signedIn,
  test,
  SYSTEM,
  expect,
} from "#test/support";

import { MANAGER_APPROVAL } from "../domain";

test("rejecting an approval delivers the outcome and decider to the feature before commit", async ({
  orm,
  seed,
}) => {
  const { sam, mia, requester, manager } = await approvalParticipants(orm, seed);
  const { transact, finished, approvals, tasks, processes } = observeApprovals(orm);
  await transact((tx) => approvals.requestApproval(requester, tx, approvalRequest(sam.id)));
  const {
    needsYou: [task],
  } = await tasks.listMyTasks(manager);
  const [run] = await processes.listRuns(ADMIN, MANAGER_APPROVAL);

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
    approvalService(orm).requestApproval(requester, tx, approvalRequest(sam.id)),
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
  const { transact, finished, approvals, processes } = observeApprovals(orm);

  await transact((tx) => approvals.requestApproval(requester, tx, approvalRequest(sam.id)));

  const [run] = await processes.listRuns(ADMIN, MANAGER_APPROVAL);
  expect(finished).toMatchObject([
    { recordId: sam.id, runId: run!.id, outcome: null, endedWithoutOutcome: "no_approver" },
  ]);
});

test("finishes the approval without an outcome when the daily pass cancels its run", async ({
  orm,
  seed,
}) => {
  const { sam, mia, requester } = await approvalParticipants(orm, seed);
  const { transact, finished, approvals, processes } = observeApprovals(orm);
  await transact((tx) => approvals.requestApproval(requester, tx, approvalRequest(sam.id)));
  const [run] = await processes.listRuns(ADMIN, MANAGER_APPROVAL);
  await employeeServices(orm).deleteEmployee(ADMIN, { id: mia.id });

  await processes.startDueRuns(SYSTEM, approvalToday());

  expect(finished).toMatchObject([
    { recordId: sam.id, runId: run!.id, outcome: null, endedWithoutOutcome: "run_cancelled" },
  ]);
});

test("cancelling a run after its decision clears the outcome for the feature and the task reader", async ({
  orm,
  seed,
}) => {
  const { sam, requester, manager } = await approvalParticipants(orm, seed);
  const record = await seed.task({ assigneeEmployeeId: sam.id, subjectEmployeeId: sam.id });
  const request = {
    ...approvalRequest(sam.id),
    record: { recordType: "task", recordId: record.id },
  };
  const { transact, finished, approvals, tasks, processes } = observeApprovals(orm);
  await transact((tx) => approvals.requestApproval(requester, tx, request));
  const [decision] = (await tasks.listMyTasks(manager)).needsYou;
  await tasks.deleteTask(requester, record.id);
  await tasks.markDone(manager, decision!.id, { result: { code: "approved", comment: null } });

  await processes.startDueRuns(SYSTEM, approvalToday());

  expect(finished).toMatchObject([
    {
      recordType: "task",
      recordId: record.id,
      outcome: null,
      endedWithoutOutcome: "run_cancelled",
    },
  ]);
  const progress = await processes.readStepProgress(manager, [decision!.id]);
  expect(progress.get(decision!.id)).toMatchObject({ status: "cancelled", outcome: null });
});

const rejection = { code: "rejected", comment: "Clashes with the release week." };
