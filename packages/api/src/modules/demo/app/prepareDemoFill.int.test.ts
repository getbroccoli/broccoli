import {
  employeeServices,
  demoService,
  expect,
  OWNER,
  readAllowances,
  storedFileIds,
  test,
  timeOffService,
  demoFillService,
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
  const service = timeOffService(orm);
  const termsId = await seed.englandAndWalesTermsId();

  await transact(await demoFillService(orm).prepareDemoFill(today));

  const policies = await service.readTermsPolicies(OWNER, { termsId });
  expect(policies).toHaveLength(4);
  expect(policies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: "uk_statutory_minimum", typeKey: "annual_leave" }),
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

const today = parseCalendarDate("2026-10-13")!;
