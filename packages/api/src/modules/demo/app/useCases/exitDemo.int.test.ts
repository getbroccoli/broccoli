import {
  employeeUseCases,
  companyUseCases,
  demoUseCases,
  expect,
  ADMIN,
  EMPLOYEE,
  storedFileIds,
  test,
} from "#test/support";

import { prepareDemoFill } from "./prepareDemoFill";

import { completeImportStep, readInstance } from "../../../../core/instance";
import { parseCalendarDate } from "../../../../utils";

test("exiting the demo deletes every employee and their avatars and returns to company setup", async ({
  orm,
  seed,
  transact,
}) => {
  const demo = demoUseCases(orm);
  const company = companyUseCases(orm);
  const { listEmployees } = employeeUseCases(orm);
  await seed.assignment();
  const owner = await seed.owner();
  await company.update(owner, { name: "Acme Corp" });
  const today = parseCalendarDate("2026-10-13")!;
  await transact(await prepareDemoFill(today));
  await transact((tx) => completeImportStep(owner, tx));
  await seed.employee();
  expect((await readInstance(orm)).step).toBe("done");

  const exited = await demo.exitDemo(owner);

  expect(exited).toEqual({ isPresent: false });
  expect((await listEmployees(owner, { first: 100 })).edges).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(await demo.getDemoData(owner)).toEqual({ isPresent: false });
  expect(await readInstance(orm)).toMatchObject({
    step: "company",
    ownerUserId: owner.user!.userId,
  });
  expect(await company.getCompany(owner)).toMatchObject({ name: "Acme Corp" });
});

test("refuses a concurrent second exit and keeps the first exit's outcome", async ({
  orm,
  seed,
  transact,
}) => {
  const owner = await seed.owner();
  await seed.assignment();
  await seed.setupStep("done");
  await transact(await prepareDemoFill(parseCalendarDate("2026-10-13")));
  const demo = demoUseCases(orm);

  const results = await Promise.allSettled([demo.exitDemo(owner), demo.exitDemo(owner)]);

  expect(results.filter(({ status }) => status === "fulfilled")).toEqual([
    { status: "fulfilled", value: { isPresent: false } },
  ]);
  expect(results.filter(({ status }) => status === "rejected")).toMatchObject([
    { reason: { code: "CONFLICT", message: "The instance holds no demo data." } },
  ]);
  expect((await readInstance(orm)).step).toBe("company");
  expect((await employeeUseCases(orm).listEmployees(owner, {})).edges).toEqual([]);
});

test("refuses to exit before setup is done and keeps the employees", async ({
  orm,
  seed,
  transact,
}) => {
  const owner = await seed.owner();
  await seed.assignment();
  await seed.setupStep("company");
  await transact(await prepareDemoFill(parseCalendarDate("2026-10-13")));
  const demo = demoUseCases(orm);
  const employees = employeeUseCases(orm);
  const before = await employees.listEmployees(owner, {});

  await expect(demo.exitDemo(owner)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "The instance holds no demo data.",
  });

  expect((await readInstance(orm)).step).toBe("company");
  expect(await employees.listEmployees(owner, {})).toEqual(before);
});

test("refuses to exit without demo data and keeps the completed setup and employee", async ({
  orm,
  seed,
}) => {
  const demo = demoUseCases(orm);
  await seed.assignment();
  const owner = await seed.owner();
  await seed.setupStep("done");
  const employee = await seed.employee();

  await expect(demo.exitDemo(owner)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "The instance holds no demo data.",
  });

  expect((await readInstance(orm)).step).toBe("done");
  const { edges } = await employeeUseCases(orm).listEmployees(owner, { first: 100 });
  expect(edges.map(({ node }) => node)).toEqual([employee]);
});

test("refuses the provisional owner exiting the demo and keeps the demo records", async ({
  orm,
  seed,
  transact,
}) => {
  const owner = await seed.demoOwner({ expiresAt: new Date("2026-10-20T12:00:00Z") });
  await transact(await prepareDemoFill(parseCalendarDate("2026-10-13")));
  const demo = demoUseCases(orm);
  const { listEmployees } = employeeUseCases(orm);
  const employees = await listEmployees(owner, { first: 100 });
  const avatarIds = await storedFileIds(orm);

  await expect(demo.exitDemo(owner)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Exit the demo through setup.",
  });

  expect(await demo.getDemoData(owner)).toEqual({ isPresent: true });
  expect(await listEmployees(owner, { first: 100 })).toEqual(employees);
  expect(await storedFileIds(orm)).toEqual(avatarIds);
  expect((await readInstance(orm)).step).toBe("done");
});

test("refuses an employee exiting the demo", async ({ orm }) => {
  const demo = demoUseCases(orm);

  await expect(demo.exitDemo(EMPLOYEE)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("refuses to reveal demo data status to an employee", async ({ orm }) => {
  const demo = demoUseCases(orm);

  await expect(demo.getDemoData(EMPLOYEE)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("refuses an admin resetting the workspace", async ({ orm }) => {
  await expect(demoUseCases(orm).exitDemo(ADMIN)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only the owner can do this.",
  });
});
