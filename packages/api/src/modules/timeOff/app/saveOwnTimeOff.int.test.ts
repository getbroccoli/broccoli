import {
  EMPLOYEE,
  expect,
  giveTermsPolicies,
  leaveRequestSetup,
  readTermsPolicies,
  signedIn,
  test,
  type TestSeed,
} from "#test/support";
import type { Orm, Transact } from "../../../core/db";

test("an employee's agent asks their manager for Annual leave and records who asked", async ({
  orm,
  seed,
}) => {
  const { requests, requesterAgent, requester, manager, tasks, ownInput } = await leaveRequestSetup(
    orm,
    seed,
  );

  const saved = await requests.saveOwnTimeOff(requesterAgent, { ...ownInput, expectedDays: 2.5 });

  expect(saved).toMatchObject({
    employeeId: requester.user!.employeeId,
    cost: 2.5,
    status: "requested",
  });
  expect((await tasks.listMyTasks(manager)).needsYou).toMatchObject([
    { title: "Approve Amira's Annual leave, 7–9 Dec" },
  ]);
  const history = await requests.readHistory(requester, saved.id, {});
  expect(history.edges.map(({ node }) => node)).toContainEqual(
    expect.objectContaining({
      operation: "CREATED",
      author: { kind: "CONNECTED_AGENT", id: requester.user!.userId },
    }),
  );
});

test("an admin books their own leave straight away and spends the days without an approval task", async ({
  orm,
  seed,
}) => {
  const { requests, ownInput, input, manager, tasks, timeOff } = await leaveRequestSetup(orm, seed);
  const admin = signedIn(orm, { employeeId: input.employeeId, profiles: ["ADMIN"] });

  const saved = await requests.saveOwnTimeOff(admin, { ...ownInput, expectedDays: 2.5 });

  expect((await requests.readStatuses(admin, [saved.id])).get(saved.id)).toMatchObject({
    employeeId: input.employeeId,
    status: "approved",
  });
  const balances = await timeOff.readTimeOffTypes(admin, { employeeIds: [input.employeeId] });
  expect(balances.get(input.employeeId)).toMatchObject([
    { used: 2.5, waiting: 0, remaining: 17.5 },
  ]);
  expect((await tasks.listMyTasks(manager)).needsYou).toEqual([]);
  expect((await tasks.listMyTasks(admin)).waitingOnOthers).toEqual([]);
});

test("refuses a changed cost with the new total and leaves the request and task unsaved", async ({
  orm,
  seed,
}) => {
  const { requests, requesterAgent, ownInput, input, tasks, manager } = await leaveRequestSetup(
    orm,
    seed,
  );

  await expect(
    requests.saveOwnTimeOff(requesterAgent, { ...ownInput, expectedDays: 3 }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This is 2.5 days now, not 3. Show the person the new preview first.",
  });

  expect(
    (await requests.readRequests(requesterAgent, [input.employeeId])).get(input.employeeId),
  ).toEqual([]);
  expect((await tasks.listMyTasks(manager)).needsYou).toEqual([]);
});

test("a read-only agent cannot save leave for its employee", async ({ orm, seed }) => {
  const { requests, input, ownInput } = await leaveRequestSetup(orm, seed);
  const agent = signedIn(orm, {
    employeeId: input.employeeId,
    profiles: ["EMPLOYEE"],
    agentConnection: { id: "amira-agent", scopes: ["broccoli:read"] },
  });

  await expect(
    requests.saveOwnTimeOff(agent, { ...ownInput, expectedDays: 2.5 }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Allow your agent to change things in Broccoli first.",
  });
});

test("an employee's agent books their Sickness straight away", async ({ orm, seed, transact }) => {
  const { requests, requesterAgent, ownInput, tasks, manager } = await leaveRequestSetup(orm, seed);
  const timeOffTypeId = await offerSickness(orm, seed, transact);

  const saved = await requests.saveOwnTimeOff(requesterAgent, {
    ...ownInput,
    timeOffTypeId,
    expectedDays: 2.5,
  });

  expect(saved).toMatchObject({ timeOffTypeId, status: "approved" });
  expect((await tasks.listMyTasks(manager)).needsYou).toEqual([]);
});

test("an employee's agent books Annual leave straight away after it is switched to No approval", async ({
  orm,
  seed,
}) => {
  const { requests, requesterAgent, ownInput, tasks, manager, changeAnnualLeaveApproval } =
    await leaveRequestSetup(orm, seed);
  await changeAnnualLeaveApproval(null);

  const saved = await requests.saveOwnTimeOff(requesterAgent, { ...ownInput, expectedDays: 2.5 });

  expect(saved).toMatchObject({ timeOffTypeId: ownInput.timeOffTypeId, status: "approved" });
  expect((await tasks.listMyTasks(manager)).needsYou).toEqual([]);
});

test("an upper-case Annual leave type id keeps the employee's request in approval", async ({
  orm,
  seed,
}) => {
  const { requests, requesterAgent, ownInput } = await leaveRequestSetup(orm, seed);
  const timeOffTypeId = ownInput.timeOffTypeId.toUpperCase();

  const modes = await requests.ownTimeOffModes(requesterAgent, [timeOffTypeId]);
  expect(modes.get(timeOffTypeId)).toBe("requested_with_approval");

  const saved = await requests.saveOwnTimeOff(requesterAgent, {
    ...ownInput,
    timeOffTypeId,
    expectedDays: 2.5,
  });
  expect(saved).toMatchObject({ timeOffTypeId: ownInput.timeOffTypeId, status: "requested" });
});

test("a caller without an employee cannot save their own leave", async ({ orm, seed }) => {
  const { requests, ownInput } = await leaveRequestSetup(orm, seed);

  await expect(
    requests.saveOwnTimeOff(EMPLOYEE, { ...ownInput, expectedDays: 2.5 }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You have no employee record in Broccoli.",
  });
});

test.for([
  ["EMPLOYEE", "requested_with_approval", "booked_straight_away"],
  ["ADMIN", "booked_straight_away", "booked_straight_away"],
] as const)(
  "%s sees how they can save each type of time off",
  async ([profile, annualMode, sicknessMode], { orm, seed, transact }) => {
    const { requests, input } = await leaveRequestSetup(orm, seed);
    const sicknessId = await offerSickness(orm, seed, transact);
    const caller = signedIn(orm, { employeeId: input.employeeId, profiles: [profile] });

    const modes = await requests.ownTimeOffModes(caller, [input.timeOffTypeId, sicknessId]);

    expect(modes).toEqual(
      new Map([
        [input.timeOffTypeId, annualMode],
        [sicknessId, sicknessMode],
      ]),
    );
  },
);

async function offerSickness(orm: Orm, seed: TestSeed, transact: Transact) {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, { termsId, policies: [{ recordOnly: "sickness" }] });
  const policies = await readTermsPolicies(orm, termsId);
  return policies.find(({ typeKey }) => typeKey === "sickness")!.timeOffTypeId;
}
