import { expect, pendingRequest, test } from "#test/support";

test("showApproval gives the holder a card with the request details and a decision token", async ({
  orm,
  seed,
}) => {
  const { agentTools, managerAgent, task } = await pendingRequest(orm, seed);

  const shown = await agentTools.showApproval(managerAgent, { taskId: task.id, origin });

  expect(shown.card).toEqual({
    taskId: task.id,
    title: "Approve Amira's Annual leave, 7–9 Dec",
    description: task.description,
    askedBy: "Amira Hassan",
    dueOn: task.dueDate,
    options: [
      { code: "approved", label: "Approve", commentRequired: false },
      { code: "rejected", label: "Reject", commentRequired: true },
    ],
    link: `${origin}/tasks/${task.id}`,
  });
  expect(shown.token).toMatch(/\S/);
  expect(shown.expiresAt).toBe("2026-11-26T13:00:00.000Z");
});

test("approving on the card charges the requested days to Amira's leave", async ({ orm, seed }) => {
  const { agentTools, managerAgent, task, requesterAgent } = await pendingRequest(orm, seed);
  const { token } = await agentTools.showApproval(managerAgent, { taskId: task.id, origin });

  const decision = await agentTools.decideApproval(managerAgent, {
    taskId: task.id,
    cardToken: token,
    resultCode: "approved",
  });

  expect(decision).toEqual({
    taskId: task.id,
    status: "DONE",
    result: { label: "Approve", comment: null },
  });
  expect((await agentTools.myLeaveBalance(requesterAgent)).types).toMatchObject([{ used: 2.5 }]);
});

test("rejecting on the card requires a comment", async ({ orm, seed }) => {
  const { agentTools, managerAgent, task } = await pendingRequest(orm, seed);
  const { token } = await agentTools.showApproval(managerAgent, { taskId: task.id, origin });

  await expect(
    agentTools.decideApproval(managerAgent, {
      taskId: task.id,
      cardToken: token,
      resultCode: "rejected",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT", message: "Add a comment to this result." });
});

const origin = "https://broccoli.example.com";
