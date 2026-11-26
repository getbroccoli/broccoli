import {
  ADMIN,
  approvalParticipants,
  approvalRequest,
  expect,
  observeApprovals,
  test,
} from "#test/support";

import { MANAGER_APPROVAL } from "../domain";

test("cancelling an approval ends its run and task and tells the feature it ended without an outcome", async ({
  orm,
  seed,
}) => {
  const { sam, requester, manager } = await approvalParticipants(orm, seed);
  const { approvals, processes, tasks, transact, finished } = observeApprovals(orm);
  const request = approvalRequest(sam.id);
  await transact((tx) => approvals.requestApproval(requester, tx, request));
  const [run] = await processes.listRuns(ADMIN, MANAGER_APPROVAL);
  const [task] = (await tasks.listMyTasks(manager)).needsYou;
  const reason = "Sam withdrew this request.";

  const cancelled = await transact((tx) =>
    approvals.cancelApproval(requester, tx, { record: request.record, reason }),
  );

  expect(cancelled).toEqual({ runId: run!.id });
  expect(await processes.listRuns(ADMIN, MANAGER_APPROVAL)).toMatchObject([
    {
      id: run!.id,
      status: "cancelled",
      cancelCause: "cancelled_because_record_was_withdrawn",
      cancelReason: reason,
      cancelledByEmployeeId: sam.id,
    },
  ]);
  expect(await tasks.readTask(manager, task!.id)).toMatchObject({
    status: "cancelled",
    cancelReason: reason,
  });
  expect(finished).toEqual([
    {
      ...request.record,
      approvalProcessKey: MANAGER_APPROVAL,
      runId: run!.id,
      outcome: null,
      endedWithoutOutcome: "run_cancelled",
    },
  ]);
});

test("cancelling a record with no approval in progress returns null and leaves other approvals alone", async ({
  orm,
  seed,
}) => {
  const { sam, mia, requester } = await approvalParticipants(orm, seed);
  const { approvals, processes, transact, finished } = observeApprovals(orm);
  await transact((tx) => approvals.requestApproval(requester, tx, approvalRequest(sam.id)));
  const before = await processes.listRuns(ADMIN, MANAGER_APPROVAL);

  const cancelled = await transact((tx) =>
    approvals.cancelApproval(requester, tx, {
      record: { recordType: "employee", recordId: mia.id },
      reason: "Request withdrawn.",
    }),
  );

  expect(cancelled).toBeNull();
  expect(await processes.listRuns(ADMIN, MANAGER_APPROVAL)).toEqual(before);
  expect(finished).toEqual([]);
});
