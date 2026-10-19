import { demoUseCases, expect, NON_OWNER, OWNER, storedFileIds, test } from "#test/support";

import { prepareDemoFill } from "./prepareDemoFill";
import { createEmployeeUseCases } from "../../../employees";
import { parseCalendarDate } from "../../../../utils";

test("removes demo employees and their avatars while keeping a real employee", async ({
  orm,
  seed,
  transact,
}) => {
  const demo = demoUseCases(orm);
  const { listEmployees } = createEmployeeUseCases({ orm });
  const today = parseCalendarDate("2026-10-13")!;
  await transact(await prepareDemoFill(today));
  const employee = await seed.employee();

  const cleared = await demo.clearDemoData(OWNER);

  expect(cleared).toEqual({ isPresent: false });
  const employees = await listEmployees(OWNER, { first: 100 });
  expect(employees.edges.map(({ node }) => node)).toEqual([employee]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(await demo.getDemoData(OWNER)).toEqual({ isPresent: false });
});

test("succeeds when there is no demo data to clear", async ({ orm }) => {
  const demo = demoUseCases(orm);

  expect(await demo.clearDemoData(OWNER)).toEqual({ isPresent: false });
});

test("refuses to clear demo data for a non-owner", async ({ orm }) => {
  const demo = demoUseCases(orm);

  await expect(demo.clearDemoData(NON_OWNER)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("refuses to reveal demo data status to a non-owner", async ({ orm }) => {
  const demo = demoUseCases(orm);

  await expect(demo.getDemoData(NON_OWNER)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
