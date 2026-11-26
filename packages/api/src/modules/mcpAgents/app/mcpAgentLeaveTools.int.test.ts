import { expect, leaveRequestSetup, test } from "#test/support";

test("myLeaveBalance shows the caller's Annual leave figures and how to ask for it", async ({
  orm,
  seed,
}) => {
  const { agentTools, requester, requesterAgent, input, timeOff } = await leaveRequestSetup(
    orm,
    seed,
  );
  const figures = await timeOff.readTimeOffTypes(requester, { employeeIds: [input.employeeId] });
  const [annual] = figures.get(input.employeeId)!;

  const balance = await agentTools.myLeaveBalance(requesterAgent);

  expect(balance).toEqual({
    today: "2026-11-26",
    reason: null,
    types: [
      {
        timeOffTypeId: annual!.timeOffType.id,
        name: annual!.timeOffType.name,
        whenYouAsk: "ASK_FOR_APPROVAL",
        balance: "FROM_ALLOWANCE",
        periodStart: annual!.periodStart,
        periodEnd: annual!.periodEnd,
        entitlement: annual!.entitlement,
        bankHolidays: annual!.bankHolidays,
        used: annual!.used,
        waiting: annual!.waiting,
        remaining: annual!.remaining,
      },
    ],
  });
});

test("previewLeave shows each day's cost and the balance after a morning off", async ({
  orm,
  seed,
}) => {
  const { agentTools, requesterAgent, input } = await leaveRequestSetup(orm, seed);

  const preview = await agentTools.previewLeave(requesterAgent, decemberLeave(input.timeOffTypeId));

  expect(preview).toMatchObject({
    whenYouAsk: "ASK_FOR_APPROVAL",
    days: [
      { date: "2026-12-07", dayPart: "FULL_DAY", cost: 1 },
      { date: "2026-12-08", dayPart: "FULL_DAY", cost: 1 },
      { date: "2026-12-09", dayPart: "MORNING", cost: 0.5 },
    ],
    totalDays: 2.5,
    balances: [
      {
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        remainingBefore: 20,
        remainingAfter: 17.5,
      },
    ],
    refusal: null,
  });
});

test("requestLeave sends the manager a task with the requester's name and a link", async ({
  orm,
  seed,
}) => {
  const { agentTools, requesterAgent, manager, input, tasks } = await leaveRequestSetup(orm, seed);

  const request = await agentTools.requestLeave(requesterAgent, {
    ...decemberLeave(input.timeOffTypeId),
    expectedDays: 2.5,
  });

  const [task] = (await tasks.listMyTasks(manager)).needsYou;
  expect(request).toEqual({
    outcome: "WAITING_FOR_APPROVAL",
    totalDays: 2.5,
    timeOffId: task!.record!.recordId,
  });
  expect(await agentTools.listMyTasks(manager, { origin })).toMatchObject({
    needsYou: [
      {
        taskId: task!.id,
        title: "Approve Amira's Annual leave, 7–9 Dec",
        description: task!.description,
        dueOn: task!.dueDate,
        status: "TO_DO",
        askedBy: "Amira Hassan",
        assignee: "Rachel Doyle",
        link: `${origin}/tasks/${task!.id}`,
        result: null,
        cancelReason: null,
      },
    ],
    waitingOnOthers: [],
    resolvedRecently: [],
    reason: null,
  });
});

test("requestLeave reports that the request ended without a decision when nobody can approve", async ({
  orm,
  seed,
}) => {
  const { agentTools, requesterAgent, input } = await leaveRequestSetup(orm, seed);
  await seed.owner();
  await seed.manager(input.employeeId, null);

  const request = await agentTools.requestLeave(requesterAgent, {
    ...decemberLeave(input.timeOffTypeId),
    expectedDays: 2.5,
  });

  expect(request.outcome).toBe("ENDED_WITH_NO_DECISION");
});

test("listMyTasks shows the requester their manager's approval under resolved tasks", async ({
  orm,
  seed,
}) => {
  const { agentTools, requests, requester, requesterAgent, manager, tasks, input } =
    await leaveRequestSetup(orm, seed);
  await requests.requestTimeOff(requester, input);
  const [task] = (await tasks.listMyTasks(manager)).needsYou;
  await tasks.markDone(manager, task!.id, { result: { code: "approved", comment: null } });

  const listed = await agentTools.listMyTasks(requesterAgent, { origin });

  expect(listed).toMatchObject({
    needsYou: [],
    waitingOnOthers: [],
    resolvedRecently: [
      { taskId: task!.id, status: "DONE", result: { label: "Approve", comment: null } },
    ],
    reason: null,
  });
});

const origin = "https://broccoli.example.com";

function decemberLeave(timeOffTypeId: string) {
  return {
    timeOffTypeId,
    startDate: "2026-12-07",
    endDate: "2026-12-09",
    halfDays: [{ date: "2026-12-09", dayPart: "MORNING" as const }],
  };
}
