import {
  ADMIN,
  notificationFlow,
  demoFillService,
  demoService,
  employeeServices,
  expect,
  OWNER,
  readAllowances,
  readTermsPolicies,
  storedFileIds,
  signedIn,
  taskService,
  test,
} from "#test/support";

import { parseCalendarDate } from "../../../utils";

test("fills 40 demo employees with distinct stored avatars", async ({ orm, transact }) => {
  const demo = demoService(orm);
  const { listEmployees } = employeeServices(orm);

  await transact(await demoFillService(orm).prepareDemoFill(today));

  const employees = await listEmployees(OWNER, { first: 100 });
  const avatarIds = employees.edges.map(({ node }) => node.avatarFileId);
  expect(employees.edges).toHaveLength(40);
  expect(new Set(avatarIds).size).toBe(40);
  expect(avatarIds).not.toContain(null);
  expect(avatarIds.toSorted()).toEqual(await storedFileIds(orm));
  expect(await demo.getDemoData(OWNER)).toEqual({ isPresent: true });
  for (const { node: employee } of employees.edges) {
    const history = await employeeServices(orm).readEmployeeHistory(OWNER, employee.id, {});
    expect(history.edges).toHaveLength(1);
    expect(history.edges[0]!.node).toMatchObject({
      operation: "CREATED",
      cause: { kind: "ADDED_WITH_DEMO", ref: null },
    });
  }
});

test("filling the demo links England and Wales terms' time off policies and grants Annual leave", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();

  await transact(await demoFillService(orm).prepareDemoFill(today));

  const policies = await readTermsPolicies(orm, termsId);
  expect(policies).toHaveLength(4);
  expect(policies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ typeKey: "annual_leave", entitlementDays: 28 }),
      expect.objectContaining({ typeKey: "sickness", balance: "no_balance" }),
      expect.objectContaining({ typeKey: "family_leave", balance: "no_balance" }),
      expect.objectContaining({ typeKey: "other", balance: "no_balance" }),
    ]),
  );
  const { edges } = await employeeServices(orm).listEmployees(OWNER, { first: 1 });
  expect(await readAllowances(orm, edges[0]!.node.id)).toMatchObject([
    { typeKey: "annual_leave", leaveYearStart: "2026-01-01", leaveYearEnd: "2026-12-31" },
  ]);
});

test("adds nothing when demo data has already been filled", async ({ orm, transact }) => {
  const demo = demoService(orm);
  const { listEmployees } = employeeServices(orm);
  const fill = await demoFillService(orm).prepareDemoFill(today);
  await transact(fill);
  const before = await listEmployees(OWNER, { first: 100 });
  const filesBefore = await storedFileIds(orm);

  await transact(fill);

  expect(await listEmployees(OWNER, { first: 100 })).toEqual(before);
  expect(await storedFileIds(orm)).toEqual(filesBefore);
  expect(await demo.getDemoData(OWNER)).toEqual({ isPresent: true });
});

test("does not fill demo data when a real employee exists", async ({ orm, seed, transact }) => {
  const employee = await seed.employee();
  const demo = demoService(orm);
  const { listEmployees } = employeeServices(orm);

  await transact(await demoFillService(orm).prepareDemoFill(today));

  const employees = await listEmployees(OWNER, { first: 100 });
  expect(employees.edges.map(({ node }) => node)).toEqual([employee]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(await demo.getDemoData(OWNER)).toEqual({ isPresent: false });
});

test("fills Oliver's tasks with three to do, two of them asking for a result, and two waiting on others", async ({
  orm,
  transact,
}) => {
  await transact(await demoFillService(orm).prepareDemoFill(today));
  const { edges } = await employeeServices(orm).listEmployees(OWNER, { first: 100 });
  const oliver = edges.find(({ node }) => node.email === "oliver.bennett@example.com")!.node;
  const priya = edges.find(({ node }) => node.email === "priya.shah@example.com")!.node;
  const james = edges.find(({ node }) => node.email === "james.whitfield@example.com")!.node;
  const ctx = signedIn(orm, { employeeId: oliver.id, profiles: ["EMPLOYEE"] });

  const tasks = await taskService(orm).listMyTasks(ctx);

  expect(tasks.needsYou).toHaveLength(3);
  expect(tasks.needsYou).toMatchObject([
    {
      title: "Sign James Whitfield's new contract",
      assigneeEmployeeId: oliver.id,
      askedByEmployeeId: priya.id,
      status: "to_do",
      dueDate: "2026-10-11",
      resultForm: null,
    },
    {
      title: "Approve the hiring plan for next quarter",
      assigneeEmployeeId: oliver.id,
      askedByEmployeeId: priya.id,
      status: "to_do",
      dueDate: "2026-10-16",
    },
    {
      title: "Choose the venue for the summer party",
      description: "Four places can take all of us on the last Friday of June.",
      assigneeEmployeeId: oliver.id,
      askedByEmployeeId: james.id,
      status: "to_do",
      dueDate: "2026-10-20",
    },
  ]);
  expect(tasks.needsYou[1]!.resultForm).toMatchObject({
    display: "buttons",
    options: [{ code: "approve" }, { code: "decline" }],
  });
  expect(tasks.needsYou[2]!.resultForm).toMatchObject({
    display: "choices",
    options: [
      { code: "riverside_terrace" },
      { code: "rooftop_bar" },
      { code: "office_garden" },
      { code: "somewhere_else" },
    ],
  });
  expect(tasks.waitingOnOthers).toHaveLength(2);
  expect(tasks.waitingOnOthers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        assigneeEmployeeId: james.id,
        askedByEmployeeId: oliver.id,
        status: "to_do",
        resultForm: null,
      }),
      expect.objectContaining({
        assigneeEmployeeId: priya.id,
        askedByEmployeeId: oliver.id,
        status: "to_do",
        resultForm: null,
      }),
    ]),
  );
});

test("demo tasks queue no notification run even when notifications are on", async ({ orm }) => {
  const notifications = notificationFlow(orm, { today: () => today });
  await notifications.processes.turnOn(ADMIN, "notifications.task_created");
  const { transact, queuedJobs } = notifications;

  await transact(await demoFillService(orm).prepareDemoFill(today));

  expect(queuedJobs).toEqual([]);
  expect(await notifications.processes.listRuns(ADMIN, "notifications.task_created")).toEqual([]);
});

const today = parseCalendarDate("2026-10-13")!;
