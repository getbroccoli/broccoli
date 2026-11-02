import {
  employeeServices,
  demoService,
  expect,
  OWNER,
  storedFileIds,
  test,
  demoFill,
} from "#test/support";

import { parseCalendarDate } from "../../../utils";

test("fills 40 demo employees with distinct stored avatars", async ({ orm, transact }) => {
  const demo = demoService(orm);
  const { listEmployees } = employeeServices(orm);

  await transact(await demoFill.prepareDemoFill(today));

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

test("adds nothing when demo data has already been filled", async ({ orm, transact }) => {
  const demo = demoService(orm);
  const { listEmployees } = employeeServices(orm);
  const fill = await demoFill.prepareDemoFill(today);
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

  await transact(await demoFill.prepareDemoFill(today));

  const employees = await listEmployees(OWNER, { first: 100 });
  expect(employees.edges.map(({ node }) => node)).toEqual([employee]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(await demo.getDemoData(OWNER)).toEqual({ isPresent: false });
});

const today = parseCalendarDate("2026-10-13")!;
