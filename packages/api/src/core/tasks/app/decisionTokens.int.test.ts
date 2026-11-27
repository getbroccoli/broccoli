import { vi } from "vitest";
import { expect, pendingRequest, signedIn, test } from "#test/support";

test("the holder can approve their time off task with its decision token", async ({
  orm,
  seed,
}) => {
  const { tasks, managerAgent, task, requests, requester, request } = await pendingRequest(
    orm,
    seed,
  );
  const {
    task: checkedTask,
    token,
    expiresAt,
  } = await tasks.issueDecisionToken(managerAgent, task.id);

  const { task: done } = await tasks.markDone(managerAgent, task.id, {
    result: approved,
    decisionToken: token,
  });

  expect(checkedTask).toEqual(task);
  expect(expiresAt).toEqual(new Date("2026-11-26T13:00:00Z"));
  expect(done).toMatchObject({ status: "done", result: approved });
  expect((await requests.readStatuses(requester, [request.id])).get(request.id)).toMatchObject({
    status: "approved",
  });
});

test("a decision without a token leaves the agent's task open", async ({ orm, seed }) => {
  const { tasks, managerAgent, task } = await pendingRequest(orm, seed);

  await expect(tasks.markDone(managerAgent, task.id, { result: approved })).rejects.toMatchObject(
    invalidToken,
  );
  expect(await tasks.readTask(managerAgent, task.id)).toMatchObject({
    status: "to_do",
    result: null,
  });
});

test("a used decision token cannot finish another open task of the same holder", async ({
  orm,
  seed,
}) => {
  const { tasks, managerAgent, managerId, task } = await pendingRequest(orm, seed);
  const second = await seed.task({ assigneeEmployeeId: managerId, resultForm: task.resultForm });
  const { token } = await tasks.issueDecisionToken(managerAgent, task.id);
  const decision = { decisionToken: token, result: approved };
  await tasks.markDone(managerAgent, task.id, decision);

  await expect(tasks.markDone(managerAgent, second.id, decision)).rejects.toMatchObject(
    invalidToken,
  );
  expect(await tasks.readTask(managerAgent, second.id)).toMatchObject({
    status: "to_do",
    result: null,
  });
});

test("another connection of the same person cannot use the token", async ({ orm, seed }) => {
  const { tasks, managerAgent, managerId, task } = await pendingRequest(orm, seed);
  const otherAgent = signedIn(orm, {
    employeeId: managerId,
    profiles: ["EMPLOYEE"],
    agentConnection: { id: "rachel-other-agent", scopes: ["broccoli:read", "broccoli:write"] },
  });
  const { token } = await tasks.issueDecisionToken(managerAgent, task.id);

  await expect(
    tasks.markDone(otherAgent, task.id, { result: approved, decisionToken: token }),
  ).rejects.toMatchObject(invalidToken);
});

test("a decision token expires after one hour", async ({ orm, seed }) => {
  const { tasks, managerAgent, task } = await pendingRequest(orm, seed);
  const { token } = await tasks.issueDecisionToken(managerAgent, task.id);
  vi.setSystemTime(new Date("2026-11-26T13:00:01Z"));

  await expect(
    tasks.markDone(managerAgent, task.id, { result: approved, decisionToken: token }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "This card has expired. Ask your agent to show it again.",
  });
});

test("a read-only agent cannot get a decision token", async ({ orm, seed }) => {
  const { tasks, managerId, task } = await pendingRequest(orm, seed);
  const readOnly = signedIn(orm, {
    employeeId: managerId,
    profiles: ["EMPLOYEE"],
    agentConnection: { id: "rachel-agent", scopes: ["broccoli:read"] },
  });

  await expect(tasks.issueDecisionToken(readOnly, task.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Allow your agent to change things in Broccoli first.",
  });
});

test("a read-only agent cannot use a token issued while its connection had write access", async ({
  orm,
  seed,
}) => {
  const { tasks, managerId, managerAgent, task } = await pendingRequest(orm, seed);
  const { token } = await tasks.issueDecisionToken(managerAgent, task.id);
  const readOnly = signedIn(orm, {
    employeeId: managerId,
    profiles: ["EMPLOYEE"],
    agentConnection: { id: "rachel-agent", scopes: ["broccoli:read"] },
  });

  await expect(
    tasks.markDone(readOnly, task.id, { result: approved, decisionToken: token }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Allow your agent to change things in Broccoli first.",
  });
  expect(await tasks.readTask(readOnly, task.id)).toMatchObject({ status: "to_do", result: null });
});

test("a browser cannot get a decision token", async ({ orm, seed }) => {
  const { tasks, manager, task } = await pendingRequest(orm, seed);

  await expect(tasks.issueDecisionToken(manager, task.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only a connected agent shows a decision card.",
  });
});

test("the person who asked cannot get a decision token for their manager's task", async ({
  orm,
  seed,
}) => {
  const { tasks, requesterAgent, task } = await pendingRequest(orm, seed);

  await expect(tasks.issueDecisionToken(requesterAgent, task.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only the person who holds this task decides it.",
  });
});

const approved = { code: "approved", comment: null };
const invalidToken = {
  code: "FORBIDDEN",
  message:
    "Your agent can't decide this. Press the button on the card, or open the task in Broccoli.",
};
