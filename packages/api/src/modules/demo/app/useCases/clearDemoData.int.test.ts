import { demoUseCases, expect, OWNER, storedFileIds, test } from "#test/support";

import { createEmployeeUseCases } from "../../../employees";
import { parseCalendarDate } from "../../../../utils";

test("removes demo employees and their avatars while keeping a real employee", async ({
  orm,
  seed,
}) => {
  const demo = demoUseCases(orm);
  const { listEmployees } = createEmployeeUseCases({ orm });
  await demo.seedDemoData(parseCalendarDate("2026-10-13")!);
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

  await expect(demo.clearDemoData({ userId: "someone", isOwner: false })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("refuses to reveal demo data status to a non-owner", async ({ orm }) => {
  const demo = demoUseCases(orm);

  await expect(demo.getDemoData({ userId: "someone", isOwner: false })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
