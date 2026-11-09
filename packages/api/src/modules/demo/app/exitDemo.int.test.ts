import {
  ADMIN,
  companyService,
  demoFillService,
  demoService,
  EMPLOYEE,
  employeeServices,
  expect,
  instances,
  recordHistory,
  readTermsPolicies,
  readTimeOffTerms,
  setupSteps,
  signedIn,
  storedFileIds,
  taskService,
  test,
  workingPatternService,
} from "#test/support";

import { parseCalendarDate } from "../../../utils";

test("exiting the demo restores only the default terms on their seeded week with time off turned off", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.assignment();
  const owner = await seed.owner();
  await companyService(orm).update(owner, { name: "Acme Corp" });
  await transact(await demoFillService(orm).prepareDemoFill(parseCalendarDate("2026-10-13")));
  await transact((tx) => setupSteps.completeImportStep(owner, tx));
  const termsId = await seed.defaultTermsId();
  expect(await readTermsPolicies(orm, termsId)).toHaveLength(4);
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(owner)).find(
    (pattern) => pattern.termsId === termsId,
  )!;
  await patterns.changePattern(owner, {
    workingPatternId: standard.id,
    startDate: "2026-11-01",
    minutes: [480, 480, 480, 480, 480, 0, 0],
  });
  await patterns.createPattern(owner, {
    name: "Part-time",
    minutes: [0, 450, 450, 450, 0, 0, 0],
  });
  await seed.terms("Scotland");

  await demoService(orm).exitDemo(owner);

  expect(await readTermsPolicies(orm, termsId)).toEqual([]);
  expect(await readTimeOffTerms(orm)).toMatchObject([
    { id: termsId, key: "default_terms", pattern: { id: standard.id } },
  ]);
  expect(await workingPatternService(orm).listPatterns(owner)).toMatchObject([
    {
      id: standard.id,
      termsId,
      name: null,
      versions: [
        {
          startDate: null,
          endDate: null,
          minutes: [450, 450, 450, 450, 450, 0, 0],
          bankHolidayCalendar: "england_and_wales",
        },
      ],
    },
  ]);
});

test("exiting the demo deletes every employee and their avatars and returns to company setup", async ({
  orm,
  seed,
  transact,
}) => {
  const demo = demoService(orm);
  const company = companyService(orm);
  const { listEmployees } = employeeServices(orm);
  await seed.assignment();
  const owner = await seed.owner();
  await company.update(owner, { name: "Acme Corp" });
  const today = parseCalendarDate("2026-10-13")!;
  await transact(await demoFillService(orm).prepareDemoFill(today));
  await transact((tx) => setupSteps.completeImportStep(owner, tx));
  await seed.employee();
  expect((await instances.readInstance(orm)).step).toBe("done");

  const exited = await demo.exitDemo(owner);

  expect(exited).toEqual({ isPresent: false });
  expect((await listEmployees(owner, { first: 100 })).edges).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(await demo.getDemoData(owner)).toEqual({ isPresent: false });
  expect(await instances.readInstance(orm)).toMatchObject({
    step: "company",
    ownerUserId: owner.user!.userId,
  });
  expect(await company.getCompany(owner)).toMatchObject({ name: "Acme Corp" });
});

test("exiting the demo forgets the demo tasks' history", async ({ orm, seed, transact }) => {
  const owner = await seed.owner();
  await seed.assignment();
  await seed.setupStep("done");
  await transact(await demoFillService(orm).prepareDemoFill(parseCalendarDate("2026-10-13")));
  const { edges } = await employeeServices(orm).listEmployees(owner, { first: 100 });
  const oliver = edges.find(({ node }) => node.email === "oliver.bennett@example.com")!.node;
  const ctx = signedIn(orm, { employeeId: oliver.id, profiles: ["EMPLOYEE"] });
  const { needsYou } = await taskService(orm).listMyTasks(ctx);
  const taskId = needsYou[0]!.id;
  expect((await recordHistory.read(orm, "task", taskId, { first: 10 })).edges).toHaveLength(1);

  await demoService(orm).exitDemo(owner);

  expect((await recordHistory.read(orm, "task", taskId, { first: 10 })).edges).toEqual([]);
});

test("refuses a concurrent second exit and keeps the first exit's outcome", async ({
  orm,
  seed,
  transact,
}) => {
  const owner = await seed.owner();
  await seed.assignment();
  await seed.setupStep("done");
  await transact(await demoFillService(orm).prepareDemoFill(parseCalendarDate("2026-10-13")));
  const demo = demoService(orm);

  const results = await Promise.allSettled([demo.exitDemo(owner), demo.exitDemo(owner)]);

  expect(results.filter(({ status }) => status === "fulfilled")).toEqual([
    { status: "fulfilled", value: { isPresent: false } },
  ]);
  expect(results.filter(({ status }) => status === "rejected")).toMatchObject([
    { reason: { code: "CONFLICT", message: "The instance holds no demo data." } },
  ]);
  expect((await instances.readInstance(orm)).step).toBe("company");
  expect((await employeeServices(orm).listEmployees(owner, {})).edges).toEqual([]);
});

test("refuses to exit before setup is done and keeps the employees", async ({
  orm,
  seed,
  transact,
}) => {
  const owner = await seed.owner();
  await seed.assignment();
  await seed.setupStep("company");
  await transact(await demoFillService(orm).prepareDemoFill(parseCalendarDate("2026-10-13")));
  const demo = demoService(orm);
  const employees = employeeServices(orm);
  const before = await employees.listEmployees(owner, {});

  await expect(demo.exitDemo(owner)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "The instance holds no demo data.",
  });

  expect((await instances.readInstance(orm)).step).toBe("company");
  expect(await employees.listEmployees(owner, {})).toEqual(before);
});

test("refuses to exit without demo data and keeps the completed setup and employee", async ({
  orm,
  seed,
}) => {
  const demo = demoService(orm);
  await seed.assignment();
  const owner = await seed.owner();
  await seed.setupStep("done");
  const employee = await seed.employee();

  await expect(demo.exitDemo(owner)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "The instance holds no demo data.",
  });

  expect((await instances.readInstance(orm)).step).toBe("done");
  const { edges } = await employeeServices(orm).listEmployees(owner, { first: 100 });
  expect(edges.map(({ node }) => node)).toEqual([employee]);
});

test("refuses the provisional owner exiting the demo and keeps the demo records", async ({
  orm,
  seed,
  transact,
}) => {
  const owner = await seed.demoOwner({ expiresAt: new Date("2026-10-20T12:00:00Z") });
  await transact(await demoFillService(orm).prepareDemoFill(parseCalendarDate("2026-10-13")));
  const demo = demoService(orm);
  const { listEmployees } = employeeServices(orm);
  const employees = await listEmployees(owner, { first: 100 });
  const avatarIds = await storedFileIds(orm);

  await expect(demo.exitDemo(owner)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Exit the demo through setup.",
  });

  expect(await demo.getDemoData(owner)).toEqual({ isPresent: true });
  expect(await listEmployees(owner, { first: 100 })).toEqual(employees);
  expect(await storedFileIds(orm)).toEqual(avatarIds);
  expect((await instances.readInstance(orm)).step).toBe("done");
});

test("refuses an employee exiting the demo", async ({ orm }) => {
  const demo = demoService(orm);

  await expect(demo.exitDemo(EMPLOYEE)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("refuses to reveal demo data status to an employee", async ({ orm }) => {
  const demo = demoService(orm);

  await expect(demo.getDemoData(EMPLOYEE)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("refuses an admin resetting the workspace", async ({ orm }) => {
  await expect(demoService(orm).exitDemo(ADMIN)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only the owner can do this.",
  });
});
