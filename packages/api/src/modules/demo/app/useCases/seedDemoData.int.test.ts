import { demoUseCases, expect, OWNER, storedFileIds, test } from "#test/support";

import { createEmployeeUseCases } from "../../../employees";
import { parseCalendarDate } from "../../../../utils";

const today = parseCalendarDate("2026-10-13")!;

test("seeds 40 demo employees with distinct stored avatars", async ({ orm }) => {
  const demo = demoUseCases(orm);
  const { listEmployees } = createEmployeeUseCases({ orm });

  await demo.seedDemoData(today);

  const employees = await listEmployees(OWNER, { first: 100 });
  const avatarIds = employees.edges.map(({ node }) => node.avatarFileId);
  expect(employees.edges).toHaveLength(40);
  expect(new Set(avatarIds).size).toBe(40);
  expect(avatarIds).not.toContain(null);
  expect(avatarIds.toSorted()).toEqual(await storedFileIds(orm));
  expect(await demo.getDemoData(OWNER)).toEqual({ isPresent: true });
});

test("adds nothing when demo data has already been seeded", async ({ orm }) => {
  const demo = demoUseCases(orm);
  const { listEmployees } = createEmployeeUseCases({ orm });
  await demo.seedDemoData(today);
  const before = await listEmployees(OWNER, { first: 100 });
  const filesBefore = await storedFileIds(orm);

  await demo.seedDemoData(today);

  expect(await listEmployees(OWNER, { first: 100 })).toEqual(before);
  expect(await storedFileIds(orm)).toEqual(filesBefore);
  expect(await demo.getDemoData(OWNER)).toEqual({ isPresent: true });
});

test("does not seed demo data when a real employee exists", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const demo = demoUseCases(orm);
  const { listEmployees } = createEmployeeUseCases({ orm });

  await demo.seedDemoData(today);

  const employees = await listEmployees(OWNER, { first: 100 });
  expect(employees.edges.map(({ node }) => node)).toEqual([employee]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(await demo.getDemoData(OWNER)).toEqual({ isPresent: false });
});
