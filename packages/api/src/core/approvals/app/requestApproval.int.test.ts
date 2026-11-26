import {
  ADMIN,
  approvalParticipants,
  approvalRequest,
  approvalToday,
  expect,
  processService,
  taskService,
  test,
  transactWithApprovals,
} from "#test/support";

import { MANAGER_APPROVAL } from "../domain";
import { createApprovalService } from "./approvalService";

test("starts one approval run with the requester's task for their manager", async ({
  orm,
  seed,
}) => {
  const { sam, mia, manager, requester } = await approvalParticipants(orm, seed);
  const request = approvalRequest(sam.id);
  const transact = transactWithApprovals(orm, { today: approvalToday });
  const processes = processService(orm);
  const tasks = taskService(orm);

  await transact((tx) => createApprovalService().requestApproval(requester, tx, request));

  const runs = await processes.listRuns(ADMIN, MANAGER_APPROVAL);
  expect(runs).toMatchObject([{ record: request.record, status: "in_progress" }]);
  const run = await processes.readRun(ADMIN, runs[0]!.id);
  expect(run.steps).toMatchObject([{ key: "decide" }]);
  expect(await tasks.readTask(manager, run.steps[0]!.task!.id)).toMatchObject({
    assigneeEmployeeId: mia.id,
    askedByEmployeeId: sam.id,
    title: request.title,
    description: request.description,
    resultForm: {
      kind: "choice",
      display: "buttons",
      options: [
        { code: "approved", label: "Approve", commentRequired: false },
        { code: "rejected", label: "Reject", commentRequired: true },
      ],
    },
  });
});

test("refuses an unknown approval process key and rolls back the caller's work", async ({
  orm,
  seed,
  transact,
}) => {
  const { sam, requester } = await approvalParticipants(orm, seed);
  const request = { ...approvalRequest(sam.id), approvalProcessKey: "unknown" };
  const tasks = taskService(orm);

  await expect(
    transact(async (tx) => {
      await tasks.createTask(requester, tx, preparationTask(sam.id));
      await createApprovalService().requestApproval(requester, tx, request);
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    message: "No approval process has this key.",
    fieldErrors: [{ field: "approvalProcessKey", code: "unknown" }],
  });
  expect((await tasks.listMyTasks(requester)).needsYou).toEqual([]);
});

test("rolls back the caller's work when Manager approval is off", async ({ orm, seed }) => {
  const { sam, requester } = await approvalParticipants(orm, seed);
  const processes = processService(orm);
  await processes.turnOff(ADMIN, MANAGER_APPROVAL);
  const transact = transactWithApprovals(orm, { today: approvalToday });
  const tasks = taskService(orm);

  await expect(
    transact(async (tx) => {
      await tasks.createTask(requester, tx, preparationTask(sam.id));
      await createApprovalService().requestApproval(requester, tx, approvalRequest(sam.id));
    }),
  ).rejects.toMatchObject(couldNotStart);
  expect((await tasks.listMyTasks(requester)).needsYou).toEqual([]);
  expect(await processes.listRuns(ADMIN, MANAGER_APPROVAL)).toEqual([]);
});

test("refuses a second request for a record whose approval is in progress", async ({
  orm,
  seed,
}) => {
  const { sam, requester } = await approvalParticipants(orm, seed);
  const transact = transactWithApprovals(orm, { today: approvalToday });
  const request = approvalRequest(sam.id);
  const approvals = createApprovalService();
  await transact((tx) => approvals.requestApproval(requester, tx, request));
  const processes = processService(orm);
  const runs = await processes.listRuns(ADMIN, MANAGER_APPROVAL);

  await expect(
    transact((tx) => approvals.requestApproval(requester, tx, request)),
  ).rejects.toMatchObject(couldNotStart);
  expect(await processes.listRuns(ADMIN, MANAGER_APPROVAL)).toEqual(runs);
});

function preparationTask(employeeId: string) {
  return {
    type: "manual_to_do",
    title: "Prepare request",
    assigneeEmployeeId: employeeId,
    askedByEmployeeId: employeeId,
  };
}

const couldNotStart = {
  code: "CONFLICT",
  message:
    "The approval could not start: its process is off or this record already has an approval in progress.",
};
