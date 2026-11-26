import { sql } from "drizzle-orm";

import {
  ADMIN,
  approvalParticipants,
  approvalRequest,
  approvalService,
  approvalToday,
  taskService,
  transactWithApprovals,
  processService,
  test,
  expect,
  expectBlockedBy,
} from "#test/support";

import { ormOf } from "../../db";
import { MANAGER_APPROVAL } from "../domain";

test("starts one approval run with the requester's task for their manager", async ({
  orm,
  seed,
}) => {
  const { sam, mia, manager, requester } = await approvalParticipants(orm, seed);
  const request = approvalRequest(sam.id);
  const transact = transactWithApprovals(orm, { today: approvalToday });
  const processes = processService(orm);
  const tasks = taskService(orm);

  await transact((tx) => approvalService(orm).requestApproval(requester, tx, request));

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
      await approvalService(orm).requestApproval(requester, tx, request);
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
      await approvalService(orm).requestApproval(requester, tx, approvalRequest(sam.id));
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
  const approvals = approvalService(orm);
  await transact((tx) => approvals.requestApproval(requester, tx, request));
  const processes = processService(orm);
  const runs = await processes.listRuns(ADMIN, MANAGER_APPROVAL);

  await expect(
    transact((tx) => approvals.requestApproval(requester, tx, request)),
  ).rejects.toMatchObject(couldNotStart);
  expect(await processes.listRuns(ADMIN, MANAGER_APPROVAL)).toEqual(runs);
});

test("refuses an unregistered subject record type and rolls back the caller's work", async ({
  orm,
  seed,
}) => {
  const { sam, requester } = await approvalParticipants(orm, seed);
  const request = { ...approvalRequest(sam.id), record: { recordType: "nope", recordId: sam.id } };
  const tasks = taskService(orm);
  const transact = transactWithApprovals(orm, { today: approvalToday });

  await expect(
    transact(async (tx) => {
      await tasks.createTask(requester, tx, preparationTask(sam.id));
      await approvalService(orm).requestApproval(requester, tx, request);
    }),
  ).rejects.toThrow("Record type nope cannot be the subject of a process.");

  expect((await tasks.listMyTasks(requester)).needsYou).toEqual([]);
  expect(await processService(orm).listRuns(ADMIN, MANAGER_APPROVAL)).toEqual([]);
});

test("a concurrent request for the same record gets a conflict and rolls back", async ({
  orm,
  seed,
}) => {
  const { sam, requester } = await approvalParticipants(orm, seed);
  const request = approvalRequest(sam.id);
  const approvals = approvalService(orm);
  const tasks = taskService(orm);
  const locked = Promise.withResolvers<number>();
  const release = Promise.withResolvers<void>();
  const holdFirst = transactWithApprovals(orm, { today: approvalToday }, async (tx, events) => {
    if (!events.some(({ type }) => type === "processes.runs_started_on_event")) return;
    const { rows } = await ormOf(tx).execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    locked.resolve(rows[0]!.pid);
    await release.promise;
  });
  const first = holdFirst((tx) => approvals.requestApproval(requester, tx, request));
  await Promise.race([locked.promise, first]);

  const transact = transactWithApprovals(orm, { today: approvalToday });
  const second = transact(async (tx) => {
    await tasks.createTask(requester, tx, preparationTask(sam.id));
    await approvals.requestApproval(requester, tx, request);
  });
  const results = Promise.allSettled([first, second]);
  try {
    await expectBlockedBy(orm, await locked.promise);
  } finally {
    release.resolve();
    await results;
  }

  expect(await results).toMatchObject([
    { status: "fulfilled" },
    { status: "rejected", reason: { code: "CONFLICT" } },
  ]);
  expect((await tasks.listMyTasks(requester)).needsYou).toEqual([]);
  expect(await processService(orm).listRuns(ADMIN, MANAGER_APPROVAL)).toHaveLength(1);
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
